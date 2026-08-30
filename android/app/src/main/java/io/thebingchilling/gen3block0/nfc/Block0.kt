package io.thebingchilling.gen3block0.nfc

/**
 * Helpers for the 16-byte Mifare block 0 layout on 4-byte-UID cards:
 * UID (4) + BCC (1) + SAK (1) + ATQA (2) + manufacturer data (8).
 *
 * BCC (byte 4) is the XOR of the UID bytes. It's not just informational —
 * the ISO14443-3 anticollision/SELECT sequence needs it to be correct to
 * present a stable UID. Writing a UID without recomputing BCC still stores
 * fine (block 0 memory holds whatever was sent), but the tag's anticollision
 * layer can end up presenting a different, effectively random UID, since it
 * can't validate the inconsistent UID+BCC pair.
 */
object Block0 {
    fun correctBcc(uid: ByteArray): Byte {
        require(uid.size == 4) { "Expected a 4-byte UID, got ${uid.size}" }
        return (uid[0].toInt() xor uid[1].toInt() xor uid[2].toInt() xor uid[3].toInt()).toByte()
    }

    /** Returns [block0] unchanged if its BCC already matches its UID, otherwise a corrected copy. */
    fun withCorrectBcc(block0: ByteArray): ByteArray {
        require(block0.size == 16) { "Block 0 must be exactly 16 bytes, got ${block0.size}" }
        val bcc = correctBcc(block0.copyOfRange(0, 4))
        return if (block0[4] == bcc) block0 else block0.copyOf().also { it[4] = bcc }
    }

    /** True if block 0 currently has a BCC that doesn't match its own UID bytes. */
    fun hasBccMismatch(block0: ByteArray): Boolean =
        block0.size == 16 && block0[4] != correctBcc(block0.copyOfRange(0, 4))
}
