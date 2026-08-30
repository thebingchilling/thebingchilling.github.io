# Gen3 Block 0 Writer

An Android app that writes block 0 (UID + manufacturer data) on **Gen3
("CUID"/APDU) magic Mifare Classic cards** — the one write operation
[MIFARE Classic Tool (MCT)](https://github.com/ikarus23/MifareClassicTool)
does not support ([MCT issue #336](https://github.com/ikarus23/MifareClassicTool/issues/336)).
Use this app alongside MCT: MCT for everything else (dumping sectors,
writing Gen1/Gen2 cards, general sector editing), this app only for Gen3
block 0.

## Workflow

1. **Read the source card.** Enter the Key A or Key B for sector 0 of the
   card you want to clone and tap it. The app authenticates and reads block
   0, exactly like MCT would.
   - Alternatively, paste a block 0 value you already have (e.g. copied out
     of an MCT dump) directly into the "Block 0 to write" field — 32 hex
     characters, no separators.
2. **Review/edit block 0.** The field is editable, so you can tweak the UID
   or manufacturer bytes before writing.
3. **Write to the Gen3 card.** Tap a blank Gen3 card. The app confirms it
   looks like Gen3 (block 0 is readable with no authentication), sends the
   set-UID backdoor command followed by the set-block0 backdoor command, then
   reads block 0 back and verifies it matches before reporting success.

There is no "lock/freeze" feature (the `90 FD 11 11 00` command some Gen3
cards support) — it permanently disables further UID changes and was out of
scope for this tool.

## Protocol notes

Gen3 cards are **not** talked to over ISO-DEP/ISO14443-4. The write/read
commands only *look* like ISO7816 APDUs (`CLA INS P1 P2 Lc ...`); they are
sent as raw NFC-A (ISO14443-3) frames, the same transport layer as ordinary
Mifare `READ`/`AUTH` commands. That's why this app uses
`android.nfc.tech.NfcA`, not `IsoDep`.

| Operation | Command |
|---|---|
| Read a block, no auth (detection + verification) | `30 <block>` |
| Set UID | `90 FB CC CC 07 <4-byte uid>` |
| Write block 0 | `90 F0 CC CC 10 <16 bytes>` |
| Lock permanently (not used here) | `90 FD 11 11 00` |

Writing block 0 sends **both** of the first two commands, set-UID then
write-block0, not block0 alone — on-device testing found that sending only
the block0 command could leave block0 *memory* correct (readable back with
the raw `30` command) while the tag's live anticollision UID stayed
unpinned/effectively random, since on this hardware the set-UID command is
what actually controls that. Confirmed via a second, independently-written
reference implementation:
[whywilson/pn532-python](https://github.com/whywilson/pn532-python)
(`pn532_cmd.py`'s `setGen3Uid`/`setGen3Block0`), which sends the same two
commands in the same order against real Gen3 hardware.

Sources: [proxmark3 `doc/magic_cards_notes.md`](https://github.com/RfidResearchGroup/proxmark3/blob/master/doc/magic_cards_notes.md),
["Gen3" magic tags · MCT issue #336](https://github.com/ikarus23/MifareClassicTool/issues/336),
[KSEC Labs Gen3 product notes](https://labs.ksec.co.uk/product/mifare-compatible-4k-4byte-magic-uid-4-byte-changeable-uid-gen-3-apdu/),
[whywilson/pn532-python](https://github.com/whywilson/pn532-python).

Reading the *source* card (step 1) uses the standard, well-documented
`android.nfc.tech.MifareClassic` API (`authenticateSectorWithKeyA/B` +
`readBlock`) — the same mechanism MCT itself uses. No backdoor is involved
there; Key A/B is only ever used to authenticate to a normal card, never to
write the Gen3 target.

## ⚠️ Not yet tested on real hardware

This was written and reviewed against the public protocol documentation
above, but there was no NFC hardware or Android SDK available in the
environment this was built in, so **none of it has been run against an
actual Gen3 card or Android device.** Before relying on it:

- Build and install via Android Studio (or `gradle assembleDebug` once you
  run `gradle wrapper` inside `android/` to generate the wrapper jar/scripts
  — they weren't generated here since it needs network access).
- Test the "looks like Gen3" detection and the write+verify path on a card
  you don't mind experimenting with first.
- If the write command's ACK bytes or exact command framing differ from
  what's implemented in `Gen3Card.kt`, the read-back verification step will
  at least catch it and report a clear mismatch rather than silently
  claiming success.

## Project layout

- `nfc/Gen3Card.kt` — raw NfcA commands for the Gen3 backdoor (detect, read,
  write+verify).
- `nfc/MifareSourceReader.kt` — standard Key A/B auth + read of block 0 from
  a normal card.
- `nfc/HexUtils.kt` — hex string parsing/formatting.
- `MainActivity.kt` — NFC foreground dispatch, tag routing, app state.
- `ui/Gen3WriterScreen.kt` — the (Jetpack Compose) UI.

`applicationId` / package: `io.thebingchilling.gen3block0`. minSdk 26,
targetSdk/compileSdk 34, Kotlin, Compose.
