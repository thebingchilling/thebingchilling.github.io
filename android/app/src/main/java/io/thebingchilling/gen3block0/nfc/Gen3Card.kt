package io.thebingchilling.gen3block0.nfc

import android.nfc.TagLostException
import android.nfc.tech.NfcA
import java.io.IOException

/**
 * Talks to Gen3 ("CUID" / APDU) magic Mifare Classic cards using their
 * manufacturer backdoor commands.
 *
 * These commands look like ISO7816 APDUs (CLA/INS/P1/P2/Lc) but the tag does
 * not implement ISO-DEP (ISO14443-4) - they are sent as plain raw NFC-A
 * frames, the same layer normal Mifare commands (READ/AUTH) use. That's why
 * this uses [NfcA], not IsoDep.
 *
 * Protocol reference: proxmark3 doc/magic_cards_notes.md, "Gen3 (APDU)"
 * section (`hf mf gen3blk` / `hf mf gen3uid` / `hf mf gen3freeze`).
 */
object Gen3Card {

    private const val CMD_READ: Byte = 0x30
    private val CMD_WRITE_BLOCK0 =
        byteArrayOf(0x90.toByte(), 0xF0.toByte(), 0xCC.toByte(), 0xCC.toByte(), 0x10)

    // Empirically, some Gen3 chips go briefly unresponsive to a plain READ
    // right after the write command (as if still committing to EEPROM) and
    // need to be re-selected before they'll answer again.
    private const val WRITE_SETTLE_MS = 50L
    private const val VERIFY_RETRY_DELAY_MS = 30L
    private const val VERIFY_RETRY_ATTEMPTS = 4

    class Gen3Error(message: String) : IOException(message)

    /**
     * Reads a block with the plain, unauthenticated Mifare READ command.
     * A normal (non-magic) card refuses this on block 0; succeeding is the
     * accepted way to identify a Gen3 card.
     */
    fun readBlockRaw(nfcA: NfcA, block: Int): ByteArray {
        val response = try {
            nfcA.transceive(byteArrayOf(CMD_READ, block.toByte()))
        } catch (e: TagLostException) {
            throw Gen3Error("Card moved away while reading block $block")
        } catch (e: IOException) {
            throw Gen3Error(
                "No usable response reading block $block — " +
                    "card likely demands authentication (probably not Gen3)"
            )
        }
        if (response.size != 16) {
            throw Gen3Error(
                "Unexpected response reading block $block " +
                    "(${response.size} bytes, expected 16) — probably not Gen3"
            )
        }
        return response
    }

    /** True if block 0 can be read with no authentication, i.e. this looks like Gen3. */
    fun looksLikeGen3(nfcA: NfcA): Boolean =
        try {
            readBlockRaw(nfcA, 0)
            true
        } catch (e: Gen3Error) {
            false
        }

    /** Result of a write: the card's raw ack to the write command, and the verified read-back. */
    data class WriteResult(val ackHex: String, val readBack: ByteArray)

    /**
     * Writes [block0] (exactly 16 bytes) via the Gen3 backdoor command, then
     * reads block 0 back to confirm the card actually stored it. The write's
     * own ack is captured for diagnostics but is not treated as authoritative
     * by itself — only the read-back match decides success, since ack framing
     * is known to vary between Gen3 chip vendors.
     */
    fun writeBlock0(nfcA: NfcA, block0: ByteArray): WriteResult {
        require(block0.size == 16) { "Block 0 must be exactly 16 bytes, got ${block0.size}" }

        // Re-select right before writing. On some Gen3 chips the F0 backdoor
        // is only honored when it's the very first command sent after the
        // tag is selected — even our own harmless Gen3-detection read
        // (looksLikeGen3), if it ran earlier in this same session, can
        // silently close that window: the write still gets acked, but is
        // quietly ignored. Testing confirmed exactly that shape (identical
        // ack every time, block 0 never actually changing).
        try {
            nfcA.close()
        } catch (e: IOException) {
            // Ignore — about to reconnect regardless.
        }
        try {
            nfcA.connect()
        } catch (e: IOException) {
            throw Gen3Error("Couldn't re-select the card right before writing: ${e.message}")
        }

        val ack = try {
            nfcA.transceive(CMD_WRITE_BLOCK0 + block0)
        } catch (e: TagLostException) {
            throw Gen3Error(
                "Card moved away during the write — it may be partially written, " +
                    "do not assume it is unchanged. Re-scan to check its current block 0."
            )
        } catch (e: IOException) {
            throw Gen3Error("Write command got no response at all: ${e.message}")
        }
        val ackHex = HexUtils.toHex(ack)

        // Give the write a moment to commit, then re-select the tag (fresh
        // REQA/anticollision) before trying to read it back — a plain
        // transceive() straight after the write is what was coming back
        // truncated/garbled in testing.
        Thread.sleep(WRITE_SETTLE_MS)
        try {
            nfcA.close()
        } catch (e: IOException) {
            // Ignore — about to reconnect regardless.
        }
        try {
            nfcA.connect()
        } catch (e: IOException) {
            throw Gen3Error("Write sent (ack $ackHex) but the card couldn't be re-selected to verify it: ${e.message}")
        }

        var lastFailure: String? = null
        repeat(VERIFY_RETRY_ATTEMPTS) { attempt ->
            try {
                val readBack = readBlockRaw(nfcA, 0)
                if (readBack.contentEquals(block0)) {
                    return WriteResult(ackHex, readBack)
                }
                lastFailure = "card reads ${HexUtils.toHex(readBack)} instead of ${HexUtils.toHex(block0)}"
            } catch (e: Gen3Error) {
                lastFailure = e.message
            }
            if (attempt < VERIFY_RETRY_ATTEMPTS - 1) Thread.sleep(VERIFY_RETRY_DELAY_MS)
        }
        throw Gen3Error("Write sent (ack $ackHex) but couldn't verify it after $VERIFY_RETRY_ATTEMPTS tries: $lastFailure")
    }
}
