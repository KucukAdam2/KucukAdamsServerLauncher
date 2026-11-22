# MC Server Launcher

Aternos benzeri, kendi bilgisayarında çalışan Minecraft sunucu yöneticisi.

- Sunucu türleri: **Vanilla, Paper, Purpur** (eklenti) ve **Fabric, Forge, NeoForge** (mod)
- **Mod & Eklenti** sekmesi: Modrinth'te ara, tek tıkla kur (gerekli bağımlılıklar otomatik), sil
- Bilgisayardan `.jar` ekleme, canlı konsol, komut gönderme, ayarlar (RAM, port, oyun modu…)

## Kullanım
1. **Java 21** kur: https://adoptium.net
2. `MC-Server-Launcher.exe` aç → **Sunucu** sekmesi → tür + sürüm seç → **Sunucuyu Kur** → EULA'yı işaretle → **Başlat**.
3. Mod/eklenti için **Mod & Eklenti** sekmesine geç.

## Geliştirme
```
npm install
npm start
```

## EXE üretme
- Yerel: `npm run build` → `dist/MC-Server-Launcher.exe`
- GitHub: `git tag v1.1.0 && git push --tags` → Actions EXE üretir ve Releases'a ekler (ya da Actions → Run workflow).

## Arkadaşların girebilsin
Router'da portu (25565) PC'ne yönlendir ya da playit.gg gibi bir tünel kullan.
