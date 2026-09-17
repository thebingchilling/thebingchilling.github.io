/* ═══════════════════════════════════════════════════════════════════════
   Close every popup the player opens.

   The player streams from third-party embeds, and those embeds open tabs:
   window.open() on the first click anywhere in the video, target="_blank"
   on an invisible overlay stretched across the whole frame, a blank tab
   written into after the fact. Chrome's own blocker misses nearly all of
   it, because every one of them is technically a click the user made.

   What separates those from a tab the user actually wanted is the frame
   that asked for it. The embed sits in an <iframe>, so everything it opens
   comes from a frame below the top one; a tab the page itself opens — a
   middle-clicked bottom-nav link today, a first-party window.open if one
   is ever added — comes from frame 0. So the frame is the test, and two of
   the three rules below are built around keeping it.

   The third cannot see frames, and leans instead on the narrower fact that
   neither player page currently opens a blank tab. That one is marked, and
   is the one to revisit if that changes.

   Scope is enforced by the permission, not just by the path list below:
   tabs.get() fills in a tab's URL only for hosts the extension can access,
   and the only host in the manifest is thebingchilling.github.io. A tab on
   any other site comes back with no URL at all and fails isPlayerUrl()
   before its path is ever considered. /tools/ fails on the path.
   ═══════════════════════════════════════════════════════════════════════ */

import { isPlayerUrl } from "./lib/scope.js";

const TOP_FRAME = 0;

/* ── How long the popup is on screen ───────────────────────────────────
   Everything between Chrome creating the popup and this closing it is
   time the popup is visible, so the close path is built to have nothing
   in front of it.

   It used to await chrome.tabs.get on every popup, purely to ask whether
   the opener was a player tab — a message to the browser process and back
   before the close could even be requested. And because a service worker
   is evicted after ~30s idle, the popup was frequently what *woke* it, so
   a cold start was on the clock too.

   So the answer is kept here instead, in memory, in a worker that a port
   from content/keepalive.js keeps resident while a player tab is open.
   The hot path is now a Map lookup and a remove, with no await before it.

   The slow path stays for the case the fast one cannot cover: a worker
   that started without the port (an update, a crash) and has not yet
   heard from the tab. It is the old behaviour, used as a fallback. */

const playerTabs = new Map(); // tabId -> the player URL it is on
const noteKey = (tabId) => `player:${tabId}`;

function remember(tabId, url) {
  playerTabs.set(tabId, url);
  chrome.storage.session.set({ [noteKey(tabId)]: url });
}

function forget(tabId) {
  playerTabs.delete(tabId);
  chrome.storage.session.remove(noteKey(tabId));
}

/* A restarted worker has an empty Map but session storage survives, so
   refill from it. Racing a popup that arrives first is fine — that one
   takes the slow path and is closed a few milliseconds later. */
chrome.storage.session.get(null).then((all) => {
  for (const [key, url] of Object.entries(all)) {
    if (!key.startsWith("player:")) continue;
    const tabId = Number(key.slice("player:".length));
    if (Number.isInteger(tabId) && !playerTabs.has(tabId)) playerTabs.set(tabId, url);
  }
}).catch(() => { /* nothing cached yet */ });

/* The content script on each player page. Its port is what keeps this
   worker resident; its sender is what identifies the tab. */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "player-tab") return;
  const tab = port.sender?.tab;
  if (!tab || tab.id === undefined || !isPlayerUrl(tab.url)) return;
  remember(tab.id, tab.url);
  port.onDisconnect.addListener(() => forget(tab.id));
});

/* Fire and forget: awaiting the removal only delays the next one. */
function close(tabId) {
  chrome.tabs.remove(tabId).catch(() => {
    /* It closed itself first. The job is done either way. */
  });
}

async function isPlayerTab(tabId) {
  if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) return false;
  if (playerTabs.has(tabId)) return true;
  try {
    const tab = await chrome.tabs.get(tabId);
    return isPlayerUrl(tab.url || tab.pendingUrl);
  } catch {
    return false; // tab is already gone
  }
}

/* ── Popups that navigate somewhere ────────────────────────────────────
   onCreatedNavigationTarget covers window.open() and target="_blank"
   alike, and covers popup *windows* too — a window opened with features is
   still a new tab to the tabs API. It fires as the target is created,
   before the popup has painted, so it closes without ever being drawn.

   It also reports which frame asked, which is what keeps the page's own
   tabs alive — today that is a middle-clicked bottom-nav link, and it
   would cover a first-party window.open too. Skipping frame 0 costs the
   blocking nothing, because no embed can ask from there. */
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  if (details.sourceFrameId === TOP_FRAME) return;

  // Deliberately not an async listener: an await here, even one that
  // resolves immediately, puts the close a task later than it needs to be.
  if (playerTabs.has(details.sourceTabId)) {
    close(details.tabId);
    return;
  }
  isPlayerTab(details.sourceTabId).then((yes) => { if (yes) close(details.tabId); });
});

/* ── Popups that do not ────────────────────────────────────────────────
   window.open() with no argument, or with "about:blank", never navigates
   anywhere, so the listener above never hears about it; the opener then
   fills the blank document in with document.write(). It is the standard
   way around a popup blocker, and the only trace it leaves is a new tab
   whose opener is the player.

   ⚠ tabs.onCreated does not report the frame, so this rule cannot use the
   test the other two rest on. It narrows itself to blank targets instead,
   which is safe only while neither player page opens one. If one ever
   does, this is the rule that needs the frame test back — most cheaply by
   having the page pass "noopener", which leaves Chrome recording no opener
   and so no match here at all. */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;

  /* Only blank targets. A tab with a real URL in it is the listener
     above's business, and that one can tell a middle-clicked nav link
     from an embed's handiwork; this one cannot, so it must not guess. */
  const target = tab.pendingUrl || tab.url || "";
  if (target !== "" && target !== "about:blank") return;

  if (playerTabs.has(tab.openerTabId)) {
    close(tab.id);
    return;
  }
  isPlayerTab(tab.openerTabId).then((yes) => { if (yes) close(tab.id); });
});

/* ── Tab-unders ────────────────────────────────────────────────────────
   The other half of the trick. Rather than open the ad in front of you,
   the embed sends the player's own tab to the ad and moves the video into
   a popup behind it, so that what you close is the player and what you are
   left looking at is the ad.

   Catching it means knowing where the tab just was, and by the time the
   navigation commits the tab's URL is the ad's. So every player page a tab
   lands on is recorded first, in session storage rather than a variable:
   this worker is torn down after ~30s idle, and an in-memory note of which
   tabs hold the player would be gone by the time a two-hour film ended.

   `client_redirect` is the qualifier Chrome attaches to a navigation a
   script started. A link the user actually clicked commits without it, as
   does the address bar — so neither can be undone by this. */

chrome.webNavigation.onCommitted.addListener(async (details) => {
  const { tabId, frameId, url, transitionQualifiers } = details;
  if (frameId !== TOP_FRAME) return;

  if (isPlayerUrl(url)) {
    remember(tabId, url);
    return;
  }

  const key = noteKey(tabId);
  const cameFrom = playerTabs.get(tabId) ?? (await chrome.storage.session.get(key))[key];
  forget(tabId);
  if (!cameFrom) return;
  if (!(transitionQualifiers || []).includes("client_redirect")) return;

  /* Sent back by URL rather than through history: a hijack done with
     location.replace() leaves no entry to go back to, and goBack() would
     land on whatever the tab held before the player — or nothing. */
  try {
    await chrome.tabs.update(tabId, { url: cameFrom });
  } catch {
    /* Tab closed mid-hijack. */
  }
});

chrome.tabs.onRemoved.addListener((tabId) => forget(tabId));
