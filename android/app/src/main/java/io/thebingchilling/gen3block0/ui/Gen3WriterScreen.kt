package io.thebingchilling.gen3block0.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.thebingchilling.gen3block0.nfc.HexUtils
import io.thebingchilling.gen3block0.nfc.KeyType

enum class ScanTarget { NONE, SOURCE, TARGET }

data class WriterUiState(
    val keyType: KeyType = KeyType.A,
    val keyHex: String = "",
    val block0Hex: String = "",
    val scanTarget: ScanTarget = ScanTarget.NONE,
    val pendingConfirmWrite: Boolean = false,
    val log: List<String> = emptyList(),
)

@Composable
fun Gen3WriterScreen(
    state: WriterUiState,
    onKeyTypeChange: (KeyType) -> Unit,
    onKeyHexChange: (String) -> Unit,
    onBlock0HexChange: (String) -> Unit,
    onStartSourceScan: () -> Unit,
    onStartTargetScan: () -> Unit,
    onConfirmTargetScan: () -> Unit,
    onDismissConfirm: () -> Unit,
    onCancelScan: () -> Unit,
) {
    Scaffold(
        topBar = { TopAppBar(title = { Text("Gen3 Block 0 Writer") }) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("1. Get block 0 from a source card", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Text("Reads a standard/protected card's block 0 using Key A or Key B, the same way MCT does.")

            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                RadioButton(selected = state.keyType == KeyType.A, onClick = { onKeyTypeChange(KeyType.A) })
                Text("Key A")
                RadioButton(selected = state.keyType == KeyType.B, onClick = { onKeyTypeChange(KeyType.B) })
                Text("Key B")
            }

            OutlinedTextField(
                value = state.keyHex,
                onValueChange = onKeyHexChange,
                label = { Text("Key (12 hex chars, e.g. FFFFFFFFFFFF)") },
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace),
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = onStartSourceScan,
                enabled = state.scanTarget == ScanTarget.NONE,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.scanTarget == ScanTarget.SOURCE) "Waiting for tap…" else "Scan source card")
            }

            HorizontalDivider()

            Text("2. Block 0 to write", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Text("Filled in automatically from step 1, or paste your own 32-hex-char block 0 (e.g. exported from MCT).")

            OutlinedTextField(
                value = state.block0Hex,
                onValueChange = onBlock0HexChange,
                label = { Text("Block 0 (32 hex chars / 16 bytes)") },
                singleLine = true,
                isError = state.block0Hex.isNotEmpty() && !HexUtils.isValidHexOfLength(state.block0Hex, 16),
                textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace),
                modifier = Modifier.fillMaxWidth(),
            )

            HorizontalDivider()

            Text("3. Write to a blank Gen3 card", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Text("Only works on genuine Gen3/CUID magic cards, which accept block 0 writes with no key.")

            Button(
                onClick = onStartTargetScan,
                enabled = state.scanTarget == ScanTarget.NONE && HexUtils.isValidHexOfLength(state.block0Hex, 16),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.scanTarget == ScanTarget.TARGET) "Waiting for tap…" else "Scan target Gen3 card & write")
            }

            if (state.scanTarget != ScanTarget.NONE) {
                OutlinedButton(onClick = onCancelScan, modifier = Modifier.fillMaxWidth()) {
                    Text("Cancel scan")
                }
            }

            HorizontalDivider()

            Text("Log", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            LazyColumn(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(state.log.asReversed()) { line ->
                    Text(line, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                }
            }
        }
    }

    if (state.pendingConfirmWrite) {
        AlertDialog(
            onDismissRequest = onDismissConfirm,
            title = { Text("Write block 0?") },
            text = {
                Text(
                    "This will overwrite block 0 (including the UID) on the next card you tap " +
                        "with:\n\n${state.block0Hex}\n\nThis only works on Gen3 cards and cannot be " +
                        "easily undone. Continue?"
                )
            },
            confirmButton = { TextButton(onClick = onConfirmTargetScan) { Text("Write") } },
            dismissButton = { TextButton(onClick = onDismissConfirm) { Text("Cancel") } },
        )
    }
}
