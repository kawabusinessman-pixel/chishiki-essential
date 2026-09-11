# Chishiki Essential Resource Pack — FixedHUD

**Version:** 33.2.5 (FixedHUD)  
**Minecraft Bedrock:** 26.40+

## Quick Guide: Rank Glyph E8

Referensi template/tool:
- https://nhanaz.github.io/glyph/

## Atlas Itu Apa?

Atlas adalah satu file PNG besar yang berisi banyak ikon dalam grid.

- File rank atlas: `font/glyph_E8.png`
- Resolusi atlas: `1024x1024`
- Grid atlas: `16x16`
- Rumus ukuran cell: `ukuran atlas / 16`
- Ukuran 1 cell pada atlas ini: `64x64`

## Maksimal Ukuran Icon Rank

- Maksimal isi icon per slot glyph di atlas ini: `64x64`.
- Jadi, `64px` itu bisa.
- `128x128` per slot tidak bisa di atlas `1024` karena cell hanya `64x64`.

## Kenapa Atlas 1024 Tetap Berguna?

- Dibanding atlas `512` (cell `32x32`), atlas `1024` memberi ruang detail lebih tinggi.
- Tim bisa edit rank lebih halus tanpa cepat pecah.
- Kamu bebas pakai ukuran kecil-sedang-besar sampai batas `64x64` sesuai kebutuhan visual.

## Standar Agar Rank Konsisten

- Gunakan proporsi visual seperti icon rank bawaan yang sudah ada di atlas ini.
- Untuk rank baru, mulai dari ukuran sedang dulu lalu samakan tinggi/panjang dengan rank tetangga agar tidak terlihat acak.
- Hindari full `64x64` jika tidak ingin rank terlihat terlalu besar.
- Offset posisi saat ini: `X +0`, `Y +14`.

## Cara Cepat Tambah Rank Baru

1. Buka https://nhanaz.github.io/glyph/.
2. Upload `font/glyph_E8.png`.
3. Pilih slot rank yang ingin dipakai.
4. Edit/tambah icon dengan ukuran yang sesuai (ikuti proporsi rank bawaan, maksimum `64x64`).
5. Pastikan posisi konsisten dengan rank lain (offset `X +0`, `Y +14`).
6. Save hasil ke `font/glyph_E8.png`.
7. Ambil icon/simbol unicode dari slot yang dipakai di website nhanaz.
8. Buka file `behavior_packs/Kiw-Essent/scripts/plugins/ranks/rank.js`, lalu masukkan unicode tersebut ke array `uuidRanks` mengikuti format yang sudah ada.
9. Unicode rank baru wajib dimasukkan di urutan paling bawah array (jangan disisipkan di tengah).
10. Reload resource pack atau restart world.

## Changelog Singkat (Versi Sekarang vs Original)

- Atlas tetap `1024x1024` (lebih lega dari original `512x512`).
- Slot rank maksimal tetap `64x64`, jadi ada ruang lebih untuk rank baru.
- Pixel rank tetap tajam karena penyesuaian posisi dilakukan dengan shift pixel (tanpa blur/resampling).
- Posisi baseline rank sudah dituning ke `Y +14` agar tampil lebih pas di chat dan panel info.
- Layout icon dikembalikan mengikuti gaya original supaya tidak acak, tapi tetap pakai canvas 1024.

## Troubleshoot Cepat

- Rank kebesaran: kecilkan ukuran icon di slot glyph.
- Rank terlalu atas/bawah: geser semua rank konsisten per langkah `2px`.

---

# Panel Scoreboard

Scoreboard digambar oleh `ui/hud_screen.json` -> `hud_title_text`, pakai texture
`textures/board/background` yang di-override tiap subpack.

## Layout: Dua Kartu Terpisah

`hud_title_text` sekarang stack panel vertikal berisi:

1. `logo_card` — kartu logo (`textures/form/title`, 102x44)
2. `card_gap` — jarak `3px`
3. `text_card` — kartu teks scoreboard (`$title_text`)

Keduanya pakai template `board_card` yang sama, ukuran `100%c` (ikut isi), dan
di-anchor `right_middle` supaya tepi kanannya rata.

Padding diatur lewat panel pembungkus di dalam tiap kartu:
`logo_pad` = `100%c + 12px` / `+ 8px`, `text_pad` = `100%c + 16px` / `+ 10px`.
Mau panel lebih lega atau lebih rapat, ubah angka itu saja.

Versi sebelumnya menumpuk logo dan teks dalam satu kotak (`title_background`)
dengan `alpha 0.8` di parent. Sekarang parent `alpha 1` dan transparansi
sepenuhnya diatur dari texture, jadi lebih gampang dikontrol.

Backup layout lama ada di `tools/board_bg/backup/hud_screen.json`.

## Spesifikasi Texture

- Ukuran: `16x16`
- Nine-slice: `6` (`background.json`: `{"nineslice_size": 6, "base_size": [16, 16]}`)
- Sudut `6x6` digambar 1:1 (tidak melar), sisi melar 1 arah, tengah `4x4` melar 2 arah.

Konsekuensi saat menggambar: ornamen aman di area sudut, jangan taruh detail di
area tengah karena melar ke segala arah.

## Style

Satu style saja, sengaja: isi gelap pekat (`#101118`, alpha `232`, di-tint 6%
warna aksen) + border `1px` warna aksen, sudut dipotong `1px`. Teks tajam di atas
rumput, pasir, salju, maupun langit, dan tetap bersih waktu panel melar.

Versi lama nge-tint seluruh panel pakai warna aksen dengan alpha `80`, jadi isi
panel ikut warna dunia dan teks tenggelam.

## Varian

Sepuluh varian, beda di warna border saja, dinamai pakai nama hewan:

`Crab` `Fox` `Bee` `Frog` `Dolphin` `Whale` `Jellyfish` `Axolotl` `Rabbit` `Raven`

Semua terdaftar di `manifest.json` -> `subpacks` dengan `memory_tier: 0`.
Total semua texture-nya di bawah `2 KB`.

## Tambah / Ubah Varian

Semua digenerate dari `tools/board_bg/`:

```
python tools/board_bg/preview.py   # cek dulu
python tools/board_bg/build.py     # tulis texture + sinkron manifest
```

Tambah varian = tambah 1 baris di `VARIANTS` (`tools/board_bg/build.py`), lalu
build ulang. Nama folder subpack tidak direferensikan script manapun, jadi
menambah/mengganti varian tidak menyentuh behavior pack.
