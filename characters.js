// ============================================================
//  DAFTAR KRU — tambah orang baru cukup di sini.
//  1. Taruh fotonya di folder photos/
//  2. Tambah baris di CROPS pada tools_crop.py, lalu jalankan:  python tools_crop.py
//  3. Tambah satu baris di bawah ini (id harus sama dengan nama file di faces/)
//
//  skill: "ngebut"  -> mobil +10% lebih cepat
//         "halus"   -> barang 35% lebih tahan goncangan
//         "teknisi" -> waktu pasang +2 detik
//         "lobi"    -> tip dari klien +30%
//         "tikus"   -> waktu order +15 detik
// ============================================================
window.CREW = [
  { id: "sidik",  name: "Sidik",    shirt: "#2456c9", skin: "#9a6a55", skill: "ngebut",  skillName: "Kaki Gas" },
  { id: "monang", name: "Monang",   shirt: "#e7a6b8", skin: "#9a6448", skill: "lobi",    skillName: "Jago Lobi Klien" },
  { id: "wawan",  name: "Wawan",    shirt: "#f4dbe3", skin: "#9a6446", skill: "halus",   skillName: "Nyetir Halus" },
  { id: "dani",   name: "Pak Dani", shirt: "#c9a46a", skin: "#93624f", skill: "tikus",   skillName: "Hafal Jalan Tikus" },
  { id: "sharil", name: "Sharil",   shirt: "#2f6fe0", skin: "#916556", skill: "teknisi", skillName: "Colok Kilat" },
  { id: "fajar",  name: "Fajar",    shirt: "#2b46c8", skin: "#b38372", skill: "ngebut",  skillName: "Gas Pol" },
  { id: "lana",   name: "Lana",     shirt: "#b9c6d6", skin: "#9a6a55", skill: "teknisi", skillName: "Install Ngebut" },
  { id: "anang",  name: "Anang",    shirt: "#1f2c55", skin: "#9c6c56", skill: "halus",   skillName: "Bawa Barang Aman" },
  { id: "pakrt",  name: "Pak RT",   shirt: "#5d6068", skin: "#c9957e", skill: "tikus",   skillName: "Kenal Semua Gang" },
  { id: "josh",   name: "Josh",     shirt: "#f6f0c8", skin: "#a77e6a", skill: "lobi",    skillName: "Senyum Maut" },
  { id: "irul",   name: "Irul",     shirt: "#bcd3ee", skin: "#906a5b", skill: "halus",   skillName: "Sabar Pol" },
  { id: "paktas", name: "Pak Tas",  shirt: "#7d93d8", skin: "#a47062", skill: "lobi",    skillName: "Klien Langganan" },
  { id: "ardi",   name: "Ardi",     shirt: "#26282e", skin: "#a87660", skill: "ngebut",  skillName: "Senyum Sambil Ngebut" },
  { id: "hery",   name: "Hery",     shirt: "#d8283a", skin: "#a87660", skill: "teknisi", skillName: "Teknisi Andalan" },
  { id: "heriw",  name: "Heri Warung", shirt: "#e9e4dc", skin: "#9a6448", skill: "tikus", skillName: "Tau Warung Tiap Gang" },
  { id: "ali",    name: "Ali",      shirt: "#f2f5ee", skin: "#a06c55", skill: "halus",   skillName: "Muka Serius, Nyetir Rapi" },
  { id: "topik",  name: "Topik",    shirt: "#efe3ec", skin: "#a8775f", skill: "teknisi", skillName: "Hacker Kantor" },
];

// ============================================================
//  OFFICE BRAWL — jurus andalan tiap orang (boleh diganti sesukanya)
//  type: "proj"  -> lempar sesuatu lurus ke depan
//        "wave"  -> gelombang kejut jarak dekat-menengah
//        "drop"  -> benda jatuh dari atas ke posisi lawan (bisa dihindari)
//        "spin"  -> meluncur berputar menabrak lawan
//        "stun"  -> lemparan yang bikin lawan pusing sebentar
//  obj:  gambar bendanya: box, ball, cap, cpu, gorengan, heart, stamp, printer, clock, cup, kentongan
//  pants: warna celana; arena favorit dipakai di mode turnamen
// ============================================================
window.BRAWL = {
  sidik:  { type: "proj", obj: "box",       name: "Lempar Kardus Kilat",   pants: "#2b3350", say: "Paket express!" },
  monang: { type: "wave", obj: "thumb",     name: "Jempol Sakti",          pants: "#1d1d24", say: "Mantap jiwa!" },
  wawan:  { type: "stun", obj: "heart",     name: "Senyum Maut",           pants: "#3a4a6a", say: "Senyum dulu dong~" },
  dani:   { type: "proj", obj: "cap",       name: "Topi Bumerang",         pants: "#5a4a3a", say: "Topinya terbang!" },
  sharil: { type: "stun", obj: "eye",       name: "Tatapan Tajam",         pants: "#1d1d24", say: "Lihat mata saya." },
  fajar:  { type: "proj", obj: "ball",      name: "Tendangan Bebas",       pants: "#1f2c55", say: "Goool!" },
  lana:   { type: "spin", obj: "cable",     name: "Cambuk Kabel LAN",      pants: "#2b3350", say: "Koneksi putus!" },
  anang:  { type: "spin", obj: "batik",     name: "Puting Beliung Batik",  pants: "#2b3350", say: "Muter, muter!" },
  pakrt:  { type: "wave", obj: "kentongan", name: "Kentongan Ronda",       pants: "#4a4f5a", say: "Tong-tong-tong!" },
  josh:   { type: "stun", obj: "clock",     name: "Jam Tangan Stop",       pants: "#1d1d24", say: "Waktunya berhenti!" },
  irul:   { type: "drop", obj: "cpu",       name: "Hujan CPU",             pants: "#1d1d24", say: "Awas kejatuhan!" },
  paktas: { type: "wave", obj: "laugh",     name: "Tawa Bahagia",          pants: "#2b3350", say: "Hahaha!" },
  ardi:   { type: "proj", obj: "ball",      name: "Tendangan Setan Merah", pants: "#1d1d24", say: "Glory glory!" },
  hery:   { type: "drop", obj: "printer",   name: "Printer Macet Jatuh",   pants: "#f2f2f2", say: "Kertasnya nyangkut!" },
  heriw:  { type: "proj", obj: "gorengan",  name: "Lempar Gorengan Panas", pants: "#3a3a40", say: "Masih anget nih!" },
  ali:    { type: "drop", obj: "stamp",     name: "Stempel ACC Raksasa",   pants: "#3a4a3a", say: "Di-ACC!" },
  topik:  { type: "stun", obj: "laptop",    name: "Hack Sistem Lawan",     pants: "#2b3350", say: "Akses diterima! 💻" },
};
