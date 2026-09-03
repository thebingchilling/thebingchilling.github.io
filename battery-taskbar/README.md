# Battery Taskbar

Shows the current battery percentage drawn directly onto the Windows tray
icon, sized as large as it can legibly go. Green while charging, white on
battery, amber under 35%, red under 15%. Right-click for status/quit.

## Get the .exe

A ready-built `BatteryTaskbar.exe` is produced automatically by the
`Build Battery Taskbar EXE` GitHub Actions workflow on every push to this
folder — download it from that workflow run's **Artifacts** section.

## Build it yourself

```
pip install -r requirements.txt pyinstaller
pyinstaller --onefile --noconsole --name BatteryTaskbar battery_tray.py
```

The executable is written to `dist/BatteryTaskbar.exe`. Run it directly, or
drop a shortcut to it in `shell:startup` to launch on sign-in.

Windows-only (uses `psutil.sensors_battery()`).
