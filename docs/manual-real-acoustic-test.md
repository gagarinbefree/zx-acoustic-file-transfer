# Real acoustic hardware test

Status: **NOT RUN**. This procedure checks a physical speaker-to-air-to-microphone path and is not covered by automated tests.

1. Open the application on two devices. Select **LOAD** on the receiving device and press **LISTEN**; grant microphone permission.
2. Select **SAVE** on the transmitting device, choose a known file of 513 bytes, and place its speaker 10 cm from the receiver microphone at 50% volume.
3. Press **TRANSMIT**. Observe `PILOT DETECTED`, `SYNCHRONIZING`, `SYNC DETECTED / RECEIVING DATA`, detector confidence, block CRC32, and block counters.
4. PASS: all three blocks pass CRC32, the received byte count is 513, the downloaded file byte-compares with the source, and no frame error appears. FAIL: any CRC failure, missing block, frame error, or byte mismatch.
5. Repeat at 25%, 50%, and 75% volume; 10 cm, 50 cm, and 1 m distance; then with typical room noise. Record confidence, passed/failed blocks, and PASS/FAIL for each run.

Do not report this procedure as passed until a person has performed and recorded these runs.
