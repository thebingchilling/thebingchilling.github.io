/* ═══════════════════════════════════════════════════════════════════════
   Close every popup the player opens.

   The player streams from third-party embeds, and those embeds open tabs:
   window.open() on the first click anywhere in the video, target="_blank"
   on an invisible overlay stretched across the whole frame, a blank tab
   written into after the fact. Chrome's own blocker misses nearly all of
   it, because every one of them is technically a click the user made.

   content/prevent-popups.js stops these before they exist, and is what
   does the real work now. This file is the net underneath it: it closes
   what did get opened, which is visibly late — the tab is created, takes
   focus, paints, and is then removed. It still earns its place, because
   it covers what the sandbox cannot: a frame the page built some way the
   content script never saw, and a source opened before the script ran.

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

async function isPlayerTab(tabId) {
  if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return isPlayerUrl(tab.url || tab.pendingUrl);
  } catch {
    return false; // tab is already gone
  }
}

async function close(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* It closed itself first. The job is done either way. */
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
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if (details.sourceFrameId === TOP_FRAME) return;
  if (!(await isPlayerTab(details.sourceTabId))) return;
  await close(details.tabId);
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
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;

  /* Only blank targets. A tab with a real URL in it is the listener
     above's business, and that one can tell a middle-clicked nav link
     from an embed's handiwork; this one cannot, so it must not guess. */
  const target = tab.pendingUrl || tab.url || "";
  if (target !== "" && target !== "about:blank") return;

  if (!(await isPlayerTab(tab.openerTabId))) return;
  await close(tab.id);
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

const noteKey = (tabId) => `player:${tabId}`;

chrome.webNavigation.onCommitted.addListener(async (details) => {
  const { tabId, frameId, url, transitionQualifiers } = details;
  if (frameId !== TOP_FRAME) return;

  if (isPlayerUrl(url)) {
    await chrome.storage.session.set({ [noteKey(tabId)]: url });
    return;
  }

  const key = noteKey(tabId);
  const cameFrom = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.remove(key);
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

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(noteKey(tabId));
});
