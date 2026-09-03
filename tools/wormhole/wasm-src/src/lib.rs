//! Thin wasm-bindgen wrapper around the `magic-wormhole` Rust crate, exposing
//! just enough of the real Magic Wormhole protocol (PAKE code exchange over
//! a public TLS-capable rendezvous server, then an encrypted file transfer
//! over a relay) for the `/tools/wormhole` page to drive from JS. No file
//! bytes or codes ever pass through any server we control — only through
//! public magic-wormhole rendezvous/relay infrastructure, end-to-end
//! encrypted. See `app_config()` for why this isn't the *official*
//! rendezvous server.

use std::cell::RefCell;
use std::future::Future;
use std::time::Duration;

use futures::channel::oneshot;
use futures::future::{Either, LocalBoxFuture, Shared};
use futures::io::Cursor;
use futures::FutureExt;
use js_sys::{Function, Uint8Array};
use magic_wormhole::{transfer, transit, Code, MailboxConnection, Wordlist, Wormhole};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Autocomplete suggestions for a partially-typed wormhole code, e.g.
/// `"7-guit"` -> `["7-guitarist"]`. Mirrors the word completion the
/// official CLI offers on tab-press: the code's word list alternates
/// between two wordlists by position, so this only ever completes the
/// last (possibly partial) word, keeping everything before it as-is.
/// Returns nothing until at least one `-` has been typed - the nameplate
/// number itself isn't a completable word.
#[wasm_bindgen]
pub fn wormhole_code_completions(prefix: String) -> Vec<String> {
    // The word count only affects `choose_words()` (random code
    // generation), not completion, so any value works here.
    Wordlist::default_wordlist(2).get_completions(&prefix)
}

fn js_err(err: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&err.to_string())
}

fn call1(f: &Function, a: JsValue) {
    let _ = f.call1(&JsValue::NULL, &a);
}

fn call2(f: &Function, a: JsValue, b: JsValue) {
    let _ = f.call2(&JsValue::NULL, &a, &b);
}

thread_local! {
    // Only one transfer runs at a time in this UI, so a single slot is enough.
    // Each cancellable operation registers its own sender here at the start
    // and doesn't touch it again, so a stray click of the cancel button can
    // never reach back into an unrelated later transfer.
    static CANCEL: RefCell<Option<oneshot::Sender<()>>> = RefCell::new(None);
}

/// Abort whatever `wormhole_send` / `wormhole_receive_connect` / `ReceiveOffer::accept`
/// call is currently in flight. A no-op if nothing is running.
#[wasm_bindgen]
pub fn wormhole_cancel() {
    CANCEL.with(|cell| {
        if let Some(tx) = cell.borrow_mut().take() {
            let _ = tx.send(());
        }
    });
}

/// A level-triggered "please cancel" signal: register once per operation
/// (this is what wires up the Cancel button, so call it *before* the
/// first `.await` of anything that should be interruptible - registering
/// it partway through leaves an earlier hang with no way out), then
/// `.clone()` it into every step that should be interruptible. All clones
/// resolve together the moment `wormhole_cancel()` fires. Boxed to a
/// single concrete type so it can be threaded through helpers without
/// every call site becoming generic over the closure's opaque future type.
type CancelSignal = Shared<LocalBoxFuture<'static, ()>>;

fn cancel_signal() -> CancelSignal {
    let (tx, rx) = oneshot::channel();
    CANCEL.with(|cell| *cell.borrow_mut() = Some(tx));
    async move {
        let _ = rx.await;
    }
    .boxed_local()
    .shared()
}

fn clear_cancel_slot() {
    CANCEL.with(|cell| *cell.borrow_mut() = None);
}

/// Runs `fut` to completion, unless the user hits Cancel or `timeout_secs`
/// passes first - either way `fut` is dropped and this returns an `Err`
/// with a message fit to show directly in the UI.
///
/// Without this, any hiccup talking to the rendezvous/relay servers (an
/// unreachable host, a protocol hiccup, anything that isn't a clean
/// error) looks exactly like an infinite hang: the promise never
/// settles, and - because the Cancel button only works once a cancel
/// signal has actually been registered - clicking it does nothing either
/// if that hasn't happened yet for the step in question.
async fn with_timeout<T>(fut: impl Future<Output = T>, cancel: CancelSignal, timeout_secs: u32) -> Result<T, JsValue> {
    let abort = async move {
        match futures::future::select(cancel, Box::pin(wasmtimer::tokio::sleep(Duration::from_secs(timeout_secs.into())))).await {
            Either::Left(_) => "Cancelled",
            Either::Right(_) => "Timed out waiting for a response. Check your connection and try again.",
        }
    };
    match futures::future::select(Box::pin(fut), Box::pin(abort)).await {
        Either::Left((value, _)) => Ok(value),
        Either::Right((message, _)) => Err(js_err(message)),
    }
}

/// Same idea as `with_timeout` but for the actual byte-transfer phases,
/// which can legitimately run for a long time on a slow link and so must
/// never be killed by a fixed timer - only by the user.
///
/// This is deliberately used *instead of* passing `cancel` straight into
/// `transfer::send`/`ReceiveOffer::accept` as their own internal `cancel`
/// parameter (they get `futures::future::pending()` there instead): a
/// `select()` at this outer layer drops the whole in-progress future the
/// instant `cancel` resolves, via plain Rust future-drop semantics, which
/// works no matter what the inner future happens to be doing or awaiting
/// - so the Cancel button can't be left wired to nothing by some internal
/// detail (e.g. a corner case in the relay handshake or read loop) not
/// forwarding cancellation the way this expects.
async fn with_cancel<T>(fut: impl Future<Output = T>, cancel: CancelSignal) -> Result<T, JsValue> {
    match futures::future::select(Box::pin(fut), cancel).await {
        Either::Left((value, _)) => Ok(value),
        Either::Right(_) => Err(js_err("Cancelled")),
    }
}

/// App config for the file-transfer protocol, pointed at a TLS-capable
/// rendezvous (mailbox) server instead of the crate's built-in default
/// (`ws://relay.magic-wormhole.io:4000/v1`).
///
/// That default is a *plaintext* WebSocket, and this page is served over
/// HTTPS - browsers refuse to open an insecure `ws://` connection from a
/// secure page at all (mixed-content blocking), so keeping it would make
/// every connection fail immediately. `wss://mailbox.mw.leastauthority.com/v1`
/// is Least Authority's public mailbox server (paired with their transit
/// relay used below, and the same one their cross-platform "Destiny"
/// client uses), which does speak TLS. The tradeoff: a plain
/// `wormhole send`/`wormhole receive` CLI invocation defaults to the
/// official mailbox instead, so it needs `--rendezvous-server` pointed
/// here too to talk to this page - see the in-page copy.
fn app_config() -> magic_wormhole::AppConfig<transfer::AppVersion> {
    transfer::APP_CONFIG.rendezvous_url("wss://mailbox.mw.leastauthority.com/v1".into())
}

/// The relay hint used for the bulk-data (transit) leg of the transfer.
///
/// `relay.mw.leastauthority.com` is the transit-relay counterpart to
/// `app_config()`'s mailbox, bridging both the classic TCP transit
/// protocol (used by the official CLI clients) and WebSocket (the only
/// option available to a browser tab, which cannot open raw TCP
/// sockets). Advertising both endpoints under one hint means a peer that
/// also points its rendezvous server here - which tries every relay hint
/// either side offers - will attempt this relay too and land in the same
/// session as this browser tab.
fn relay_hints() -> Result<Vec<transit::RelayHint>, JsValue> {
    let tcp: url::Url = "tcp://relay.mw.leastauthority.com:4001"
        .parse()
        .map_err(js_err)?;
    let ws: url::Url = "wss://relay.mw.leastauthority.com".parse().map_err(js_err)?;
    let hint = transit::RelayHint::from_urls(Some("leastauthority.com".to_string()), [tcp, ws])
        .map_err(js_err)?;
    Ok(vec![hint])
}

/// Send `bytes` (named `file_name`) through a freshly allocated wormhole code.
///
/// `on_code(code)` fires as soon as a code has been allocated (show it to the
/// user immediately - the other side needs it to connect). `on_status(text)`
/// fires on major state changes ("waiting for the other side", "connected",
/// "transferring"). `on_progress(sent, total)` fires repeatedly while bytes
/// are moving.
#[wasm_bindgen]
pub async fn wormhole_send(
    bytes: Uint8Array,
    file_name: String,
    on_code: Function,
    on_status: Function,
    on_progress: Function,
) -> Result<(), JsValue> {
    let data = bytes.to_vec();
    let size = data.len() as u64;
    let relay = relay_hints()?;
    let cancel = cancel_signal();

    call1(&on_status, JsValue::from_str("Allocating a wormhole code…"));
    let mailbox = match with_timeout(MailboxConnection::create(app_config(), 2), cancel.clone(), 20).await {
        Ok(result) => result.map_err(js_err),
        Err(e) => Err(e),
    };
    let mailbox = match mailbox {
        Ok(m) => m,
        Err(e) => {
            clear_cancel_slot();
            return Err(e);
        }
    };
    call1(&on_code, JsValue::from_str(mailbox.code().to_string().as_str()));
    call1(
        &on_status,
        JsValue::from_str("Waiting for the other side to connect…"),
    );

    // Waiting for a human on the other end to type the code in is normal
    // and can take a while, so this gets a much longer leash than the
    // "is the server even reachable" checks above and below.
    let wormhole = match with_timeout(Wormhole::connect(mailbox), cancel.clone(), 600).await {
        Ok(result) => result.map_err(js_err),
        Err(e) => Err(e),
    };
    let wormhole = match wormhole {
        Ok(w) => w,
        Err(e) => {
            clear_cancel_slot();
            return Err(e);
        }
    };
    call1(&on_status, JsValue::from_str("Connected. Sending…"));

    let offer = transfer::offer::OfferSend::new_file_custom(
        file_name,
        size,
        transfer::offer::new_offer_content(move || {
            let data = data.clone();
            async move { Ok::<_, std::io::Error>(Cursor::new(data)) }
        }),
    );

    let status_for_transit = on_status.clone();
    let result = with_cancel(
        transfer::send(
            wormhole,
            relay,
            transit::Abilities::FORCE_RELAY,
            offer,
            move |_info| call1(&status_for_transit, JsValue::from_str("Transferring…")),
            move |sent, total| call2(&on_progress, JsValue::from_f64(sent as f64), JsValue::from_f64(total as f64)),
            futures::future::pending(),
        ),
        cancel,
    )
    .await;
    clear_cancel_slot();
    match result {
        Ok(inner) => inner.map_err(js_err),
        Err(e) => Err(e),
    }
}

/// Connect to an existing wormhole code and wait for the sender's file offer.
/// Returns a [`ReceiveOffer`] describing the pending offer; call `accept()`
/// or `reject()` on it to finish.
#[wasm_bindgen]
pub async fn wormhole_receive_connect(code: String, on_status: Function) -> Result<ReceiveOffer, JsValue> {
    let code: Code = code.trim().parse().map_err(js_err)?;
    let relay = relay_hints()?;
    let cancel = cancel_signal();

    call1(&on_status, JsValue::from_str("Connecting…"));
    let mailbox = match with_timeout(MailboxConnection::connect(app_config(), code, false), cancel.clone(), 20).await {
        Ok(result) => result.map_err(js_err),
        Err(e) => Err(e),
    };
    let mailbox = match mailbox {
        Ok(m) => m,
        Err(e) => {
            clear_cancel_slot();
            return Err(e);
        }
    };

    let wormhole = match with_timeout(Wormhole::connect(mailbox), cancel.clone(), 60).await {
        Ok(result) => result.map_err(js_err),
        Err(e) => Err(e),
    };
    let wormhole = match wormhole {
        Ok(w) => w,
        Err(e) => {
            clear_cancel_slot();
            return Err(e);
        }
    };
    call1(&on_status, JsValue::from_str("Connected. Waiting for the file offer…"));

    let request = match with_timeout(
        transfer::request_file(wormhole, relay, transit::Abilities::FORCE_RELAY, futures::future::pending()),
        cancel,
        30,
    )
    .await
    {
        Ok(result) => result.map_err(js_err),
        Err(e) => Err(e),
    };
    clear_cancel_slot();

    match request? {
        Some(req) => Ok(ReceiveOffer { inner: Some(req) }),
        None => Err(js_err("Cancelled")),
    }
}

/// A pending file offer from the sender. Consumed by exactly one of
/// `accept()` or `reject()`.
#[wasm_bindgen]
pub struct ReceiveOffer {
    inner: Option<transfer::ReceiveRequest>,
}

#[wasm_bindgen]
impl ReceiveOffer {
    #[wasm_bindgen(getter, js_name = fileName)]
    pub fn file_name(&self) -> String {
        self.inner.as_ref().map(|r| r.file_name()).unwrap_or_default()
    }

    #[wasm_bindgen(getter, js_name = fileSize)]
    pub fn file_size(&self) -> f64 {
        self.inner.as_ref().map(|r| r.file_size() as f64).unwrap_or(0.0)
    }

    /// Accept the offer and return the received bytes once the transfer completes.
    pub async fn accept(&mut self, on_status: Function, on_progress: Function) -> Result<Uint8Array, JsValue> {
        let req = self.inner.take().ok_or_else(|| js_err("This offer was already used"))?;
        let size = req.file_size() as usize;
        let mut buf = Cursor::new(vec![0u8; size]);

        let status_for_transit = on_status.clone();
        call1(&on_status, JsValue::from_str("Receiving…"));
        let cancel = cancel_signal();
        let result = with_cancel(
            req.accept(
                move |_info| call1(&status_for_transit, JsValue::from_str("Receiving…")),
                move |received, total| {
                    call2(&on_progress, JsValue::from_f64(received as f64), JsValue::from_f64(total as f64))
                },
                &mut buf,
                futures::future::pending(),
            ),
            cancel,
        )
        .await;
        clear_cancel_slot();
        match result {
            Ok(inner) => inner.map_err(js_err)?,
            Err(e) => return Err(e),
        };

        Ok(Uint8Array::from(buf.into_inner().as_slice()))
    }

    /// Reject the offer and let the sender know.
    pub async fn reject(&mut self) -> Result<(), JsValue> {
        let req = self.inner.take().ok_or_else(|| js_err("This offer was already used"))?;
        req.reject().await.map_err(js_err)
    }
}
