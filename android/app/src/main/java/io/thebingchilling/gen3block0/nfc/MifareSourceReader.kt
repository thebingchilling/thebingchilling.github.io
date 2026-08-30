package io.thebingchilling.gen3block0.nfc

import android.nfc.Tag
import android.nfc.tech.MifareClassic
import android.nfc.tech.TagLostException
import java.io.IOException

enum class KeyType { A, B }

/**
 * Reads block 0 off a standard (non-magic) Mifare Classic card using normal
 * sector-0 authentication + read — the same thing MCT does, and the only
 * thing genuine cards allow. This is the "source" side of a clone: the card
 * whose block 0 (UID + manufacturer data) you want to copy onto a blank
 * Gen3 card.
 */
object MifareSourceReader {

    class ReadError(message: String) : IOException(message)

    fun readBlock0(tag: Tag, keyType: KeyType, key: ByteArray): ByteArray {
        require(key.size == 6) { "Mifare keys are 6 bytes, got ${key.size}" }
        val mifare = MifareClassic.get(tag)
            ?: throw ReadError("This tag doesn't support Mifare Classic — wrong card?")

        try {
            mifare.connect()
            val authed = when (keyType) {
                KeyType.A -> mifare.authenticateSectorWithKeyA(0, key)
                KeyType.B -> mifare.authenticateSectorWithKeyB(0, key)
            }
            if (!authed) {
                throw ReadError("Authentication failed on sector 0 — wrong key or key type?")
            }
            return mifare.readBlock(0)
        } catch (e: TagLostException) {
            throw ReadError("Card moved away before block 0 could be read")
        } catch (e: IOException) {
            throw ReadError("Read failed: ${e.message}")
        } finally {
            try {
                mifare.close()
            } catch (e: IOException) {
                // Tag is already gone; nothing to clean up.
            }
        }
    }
}
