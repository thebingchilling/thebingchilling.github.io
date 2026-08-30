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
 * section (`hf mf gen3blk` / `hf mf gen3uid` / `hf mf gen3freeze`), cross-checked
 * against whywilson/pn532-python's gen3_set_block0, which is known-working
 * against real Gen3 hardware. That reference sends *two* commands — set UID,
 * then set block0 — not block0 alone; skipping the UID command is what left
 * this app writing block0 memory correctly while the tag's live anticollision
 * UID stayed wrong/unpinned.
 */
object Gen3Card {

    private const val CMD_READ: Byte = 0x30
    private val CMD_SET_UID =
        byteArrayOf(0x90.toByte(), 0xFB.toByte(), 0xCC.toByte(), 0xCC.toByte(), 0x07)
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

    /** Result of a write: the raw acks to each command sent, and the verified read-back. */
    data class WriteResult(val uidAckHex: String, val ackHex: String, val readBack: ByteArray)

    private fun reselect(nfcA: NfcA, context: String) {
        try {
            nfcA.close()
        } catch (e: IOException) {
            // Ignore — about to reconnect regardless.
        }
        try {
            nfcA.connect()
        } catch (e: IOException) {
            throw Gen3Error("Couldn't re-select the card $context: ${e.message}")
        }
    }

    /**
     * Writes [block0] (exactly 16 bytes) via the Gen3 backdoor. This sends
     * *two* commands, matching known-working reference implementations
     * (e.g. whywilson/pn532-python's gen3_set_block0): first "set UID"
     * (0x90 0xFB), then "set block0" (0x90 0xF0). Sending only the block0
     * command (what this app did before) can leave block0 *memory* correct
     * while the tag's live anticollision UID stays unpinned/effectively
     * random, since on some chips that's what the UID command actually
     * controls. Finishes by reading block 0 back to confirm it stuck.
     */
    fun writeBlock0(nfcA: NfcA, block0: ByteArray): WriteResult {
        require(block0.size == 16) { "Block 0 must be exactly 16 bytes, got ${block0.size}" }
        val uid = block0.copyOfRange(0, 4)

        // Re-select right before each backdoor command. On some Gen3 chips
        // (confirmed by testing) these commands are only honored as the very
        // first thing sent after the tag is selected — anything sent earlier
        // in the same session, even one of our own prior commands, can
        // silently close that window.
        reselect(nfcA, "before setting the UID")
        val uidAck = try {
            nfcA.transceive(CMD_SET_UID + uid)
        } catch (e: TagLostException) {
            throw Gen3Error("Card moved away while setting the UID")
        } catch (e: IOException) {
            throw Gen3Error("Set-UID command got no response at all: ${e.message}")
        }
        val uidAckHex = HexUtils.toHex(uidAck)

        reselect(nfcA, "before writing block 0")
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
        reselect(nfcA, "to verify the write")

        var lastFailure: String? = null
        repeat(VERIFY_RETRY_ATTEMPTS) { attempt ->
            try {
                val readBack = readBlockRaw(nfcA, 0)
                if (readBack.contentEquals(block0)) {
                    return WriteResult(uidAckHex, ackHex, readBack)
                }
                lastFailure = "card reads ${HexUtils.toHex(readBack)} instead of ${HexUtils.toHex(block0)}"
            } catch (e: Gen3Error) {
                lastFailure = e.message
            }
            if (attempt < VERIFY_RETRY_ATTEMPTS - 1) Thread.sleep(VERIFY_RETRY_DELAY_MS)
        }
        throw Gen3Error(
            "Set UID and wrote block 0 (acks $uidAckHex, $ackHex) but couldn't verify " +
                "block 0 after $VERIFY_RETRY_ATTEMPTS tries: $lastFailure"
        )
    }
}
