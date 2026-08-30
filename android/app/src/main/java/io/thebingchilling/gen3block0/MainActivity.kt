package io.thebingchilling.gen3block0

import android.app.PendingIntent
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.MifareClassic
import android.nfc.tech.NfcA
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import io.thebingchilling.gen3block0.nfc.Gen3Card
import io.thebingchilling.gen3block0.nfc.HexUtils
import io.thebingchilling.gen3block0.nfc.KeyType
import io.thebingchilling.gen3block0.nfc.MifareSourceReader
import io.thebingchilling.gen3block0.ui.Gen3Theme
import io.thebingchilling.gen3block0.ui.Gen3WriterScreen
import io.thebingchilling.gen3block0.ui.ScanTarget
import io.thebingchilling.gen3block0.ui.WriterUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private var nfcAdapter: NfcAdapter? = null
    private lateinit var pendingIntent: PendingIntent
    private lateinit var intentFiltersArray: Array<android.content.IntentFilter>
    private lateinit var techListsArray: Array<Array<String>>

    private var uiState by mutableStateOf(WriterUiState())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        if (nfcAdapter == null) {
            uiState = uiState.copy(log = uiState.log + "No NFC adapter on this device.")
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), flags
        )
        intentFiltersArray = arrayOf(android.content.IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED))
        techListsArray = arrayOf(
            arrayOf(MifareClassic::class.java.name, NfcA::class.java.name),
            arrayOf(NfcA::class.java.name),
        )

        setContent {
            Gen3Theme {
                Surface {
                    Gen3WriterScreen(
                        state = uiState,
                        onKeyTypeChange = { uiState = uiState.copy(keyType = it) },
                        onKeyHexChange = { uiState = uiState.copy(keyHex = it) },
                        onBlock0HexChange = { uiState = uiState.copy(block0Hex = it, pendingConfirmWrite = false) },
                        onStartSourceScan = ::startSourceScan,
                        onStartTargetScan = { uiState = uiState.copy(pendingConfirmWrite = true) },
                        onConfirmTargetScan = ::startTargetScan,
                        onDismissConfirm = { uiState = uiState.copy(pendingConfirmWrite = false) },
                        onCancelScan = { uiState = uiState.copy(scanTarget = ScanTarget.NONE) },
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.enableForegroundDispatch(this, pendingIntent, intentFiltersArray, techListsArray)
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action != NfcAdapter.ACTION_TECH_DISCOVERED) return
        val tag = IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag::class.java) ?: return
        when (uiState.scanTarget) {
            ScanTarget.SOURCE -> onSourceTagScanned(tag)
            ScanTarget.TARGET -> onTargetTagScanned(tag)
            ScanTarget.NONE -> Unit
        }
    }

    private fun startSourceScan() {
        if (!HexUtils.isValidHexOfLength(uiState.keyHex, 6)) {
            uiState = uiState.copy(log = uiState.log + "Key must be 12 hex characters (6 bytes).")
            return
        }
        uiState = uiState.copy(
            scanTarget = ScanTarget.SOURCE,
            log = uiState.log + "Waiting for source card (tap it now)…",
        )
    }

    private fun startTargetScan() {
        if (!HexUtils.isValidHexOfLength(uiState.block0Hex, 16)) {
            uiState = uiState.copy(
                pendingConfirmWrite = false,
                log = uiState.log + "Block 0 must be exactly 32 hex characters (16 bytes).",
            )
            return
        }
        uiState = uiState.copy(
            pendingConfirmWrite = false,
            scanTarget = ScanTarget.TARGET,
            log = uiState.log + "Waiting for target Gen3 card (tap it now)…",
        )
    }

    private fun onSourceTagScanned(tag: Tag) {
        val keyHex = uiState.keyHex
        val keyType = uiState.keyType
        uiState = uiState.copy(scanTarget = ScanTarget.NONE)
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { MifareSourceReader.readBlock0(tag, keyType, HexUtils.fromHex(keyHex)) }
            }
            result.onSuccess { block0 ->
                uiState = uiState.copy(
                    block0Hex = HexUtils.toHex(block0),
                    log = uiState.log + "Read block 0 from source card: ${HexUtils.toHex(block0)}",
                )
            }.onFailure { e ->
                uiState = uiState.copy(log = uiState.log + "Source read failed: ${e.message}")
            }
        }
    }

    private fun onTargetTagScanned(tag: Tag) {
        val block0Hex = uiState.block0Hex
        uiState = uiState.copy(scanTarget = ScanTarget.NONE)
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val nfcA = NfcA.get(tag)
                        ?: error("This tag doesn't expose the raw NfcA layer — not a Gen3 card?")
                    nfcA.connect()
                    try {
                        if (!Gen3Card.looksLikeGen3(nfcA)) {
                            error("Block 0 is not readable without authentication — this card doesn't look like Gen3.")
                        }
                        Gen3Card.writeBlock0(nfcA, HexUtils.fromHex(block0Hex))
                    } finally {
                        runCatching { nfcA.close() }
                    }
                }
            }
            result.onSuccess { write ->
                uiState = uiState.copy(
                    log = uiState.log + "Wrote and verified block 0: ${HexUtils.toHex(write.readBack)} " +
                        "(write ack was ${write.ackHex})",
                )
            }.onFailure { e ->
                uiState = uiState.copy(log = uiState.log + "Write failed: ${e.message}")
            }
        }
    }
}
