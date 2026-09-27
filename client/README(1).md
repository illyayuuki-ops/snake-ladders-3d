# Snakes & Ladders 3D — Arena Edition (Flutter client)

Cross-platform client (Android, iOS, Web, Desktop). See the
[repository README](../README.md) for the full documentation: rules, setup,
the backend API contract, and how to play ONLINE across devices.

```bash
flutter pub get
flutter run              # device / Chrome / desktop
flutter build web        # installable PWA build (web/manifest.json + sw.js)
flutter test
```

The client runs the **shared engine** (`../shared`) for fully-offline VS_AI and
LOCAL play; ONLINE mode talks to the backend over the WebSocket/REST contract
(server-authoritative).
