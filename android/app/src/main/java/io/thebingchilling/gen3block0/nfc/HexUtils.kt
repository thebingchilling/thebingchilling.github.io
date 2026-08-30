package io.thebingchilling.gen3block0.nfc

object HexUtils {

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02X".format(it) }

    /** Parses a hex string (spaces/colons allowed as separators) into bytes. */
    fun fromHex(hex: String): ByteArray {
        val cleaned = hex.trim().replace(" ", "").replace(":", "")
        require(cleaned.isNotEmpty()) { "Value is empty" }
        require(cleaned.length % 2 == 0) { "Hex value must have an even number of characters" }
        require(cleaned.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
            "Value contains non-hex characters"
        }
        return ByteArray(cleaned.length / 2) { i ->
            cleaned.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    fun isValidHexOfLength(hex: String, byteLength: Int): Boolean =
        try {
            fromHex(hex).size == byteLength
        } catch (e: IllegalArgumentException) {
            false
        }
}
