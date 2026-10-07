# Sistem-Bracket-Tournament

Live drawing: klik kartu wheel, lalu double-click satu nama dari tabel. Tekan tombol di tengah wheel untuk spin satu pemain, atau **Spin semua** di atas kumpulan wheel untuk memutar semua wheel yang terisi. Animasi berjalan sesuai durasi di Settings. Popup hasil menyediakan spin ulang pada wheel asal, pilihan tim dan logo per pemain. **Simpan semua hasil** aktif setelah semua tim dipilih; hasil dan tim sementara tersimpan di database sampai seluruh kelompok disimpan. Pemain di wheel lain yang belum diputar tetap terpilih setelah menyimpan hasil spin tunggal.

Untuk Supabase yang sudah memiliki tabel `teams`, `players`, dan `matches`, salin seluruh `migrations/supabase_upgrade.sql` ke SQL Editor lalu Run sebagai postgres. File gabungan ini mencakup migrasi 001, 003 (termasuk perbaikan safeupdate 002), dan 004 dalam satu transaksi; boleh dijalankan ulang dan tidak menjalankan seed/reset atau mengganti pemain, tim, dan hasil lama. Hasil drawing sementara versi lama dikonversi ke format bulk spin. Untuk project Supabase baru, `schema_and_seed.sql` membuat tabel beserta data contoh, kemudian jalankan file upgrade tersebut. Jangan jalankan ulang seed pada database aktif karena seed menimpa nama pemain.

`npm run dev:local` menerapkan migrasi drawing pada PostgreSQL lokal dan menjalankan preview. Pengujian SQL di `tests/live-drawing.sql` dan `tests/live-drawing-batch.sql` harus dijalankan hanya pada database uji terpisah setelah schema lokal dan migrasi 001/003; kedua pengujian melakukan rollback.

Status bermain: jalankan `migrations/004_match_playing.sql` di Supabase (preview lokal menerapkannya otomatis). Di detail pertandingan, ikon controller menyalakan atau menghentikan kilauan hijau yang menyapu kartu dan border berdenyut, pensil mengedit pemain/tim, dan **W** memilih pemenang. Kedua pemain harus terisi untuk mulai bermain. Memilih pemenang menghentikan animasi, meredupkan pemain kalah, dan tetap menyorot pemenang. Status tersimpan di database dan bracket yang terbuka diperbarui setiap lima detik. Migrasi 004 tidak menghapus atau mengganti pemain, tim, atau hasil lama.

`tests/match-playing.sql` memeriksa siklus status dan akses fungsi setelah migrasi 004, dengan rollback. Gunakan database uji terpisah. `node --test tests/match-detail.test.mjs` memeriksa kontrol admin/penonton dan kondisi kartu pertandingan.

