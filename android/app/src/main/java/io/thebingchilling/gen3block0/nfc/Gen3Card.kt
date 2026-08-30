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

    /**
     * Writes [block0] (exactly 16 bytes) via the Gen3 backdoor command, then
     * reads block 0 back to confirm the card actually stored it. The ack
     * byte(s) returned by the write itself are not treated as authoritative;
     * only the read-back is.
     */
    fun writeBlock0(nfcA: NfcA, block0: ByteArray): ByteArray {
        require(block0.size == 16) { "Block 0 must be exactly 16 bytes, got ${block0.size}" }

        try {
            nfcA.transceive(CMD_WRITE_BLOCK0 + block0)
        } catch (e: TagLostException) {
            throw Gen3Error(
                "Card moved away during the write — it may be partially written, " +
                    "do not assume it is unchanged. Re-scan to check its current block 0."
            )
        } catch (e: IOException) {
            throw Gen3Error("Write command failed: ${e.message}")
        }

        val readBack = readBlockRaw(nfcA, 0)
        if (!readBack.contentEquals(block0)) {
            throw Gen3Error(
                "Write did not verify: card now reads ${HexUtils.toHex(readBack)} " +
                    "instead of ${HexUtils.toHex(block0)}"
            )
        }
        return readBack
    }
}
