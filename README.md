# Game Kantor

Dua game 3D dengan wajah teman kantor:
- **Antar Rakit** (`antar.html`): antar komputer ke klien, cukup ketuk.
- **Office Brawl** (`brawl.html`): adu jotos 1 lawan 1 dengan jurus andalan masing-masing.

- **Ring Kantor** (`ring.html`): tinju otomatis bergaya diorama pixel. Tonton, atur strategi pojok, dan taruhan pakai Poin Kantor (bukan uang).

Halaman depan `index.html` untuk memilih game.

Ring Kantor: kekuatan tiap petinju (tenaga, kecepatan, dagu, stamina) dihitung tetap dari namanya, jadi selalu sama tiap main. Poin taruhan tersimpan di browser HP/laptop masing-masing.

## Cara main di laptop
Buka terminal di folder ini lalu jalankan:

    python -m http.server 8080

Lalu buka http://localhost:8080 di browser. Kalau `index.html` dibuka langsung tanpa server, foto wajah tidak akan muncul.

## Tambah orang baru
1. Simpan fotonya di folder `photos/` (misalnya `photos/budi.jpg`).
2. Di `tools_crop.py`, tambah satu baris ke `CROPS`: `"budi": ("budi.jpg", tengahX, atasKepala, lebar)`.
3. Jalankan `python tools_crop.py`. Hasil potongannya ada di `faces/budi.png`, cek apakah wajahnya pas.
4. Di `characters.js`, tambah satu baris di `CREW` dengan `id: "budi"`, dan satu baris di `BRAWL` untuk jurusnya.

Orang yang fotonya belum ada di `faces/` disembunyikan otomatis dari game.

## Antar Rakit
- Ketuk tombol kuning besar (atau gedung / kartu order): mobil jalan sendiri.
- Kalau muncul tombol PELAN / REM, ketuk cepat (atau Spasi).
- Opsional nyetir sendiri: panah/WASD (↑ kanan-atas, → kanan-bawah, ↓ kiri-bawah, ← kiri-atas). Enter = tombol kuning, K = kopi, P = jeda.

## Office Brawl
- Layar: tombol ◀ ▶, Pukul, Tendang, Tangkis (tahan), Jurus (kalau bar biru penuh).
- Keyboard pemain 1: A/D jalan, F pukul, G tendang, S tangkis, R jurus.
- Keyboard pemain 2: ←/→ jalan, K pukul, L tendang, ↓ tangkis, O jurus.
- Mode gampang (default nyala): jagoan jalan sendiri mendekati lawan.
- Mode Tawuran: 3–8 jagoan sekaligus (1–2 pemain, sisanya komputer). Yang terakhir berdiri menang.
