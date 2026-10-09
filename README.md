# News Website (Node.js version, Admin Panel ke saath)

Ek poori news website: public site jahan log khabrein padhte hain, aur admin panel jahan se aap roz ki khabrein daalte hain. Node.js (Express) me bani hai.

> **Render par lagana hai?** Poore steps `DEPLOY-RENDER.md` me hain.

## Data kahan save hota hai

Site do tarah se chal sakti hai, apne aap pehchan leti hai:

| Mode | Kab | Data kahan |
|---|---|---|
| **PostgreSQL** | `DATABASE_URL` set ho (Render Free + Neon) | Cloud database me: khabrein, photos, login, sab |
| **SQLite file** | `DATABASE_URL` na ho (apna computer, ya disk wala server) | `data/news.sqlite` file me |

Photos bhi database me hi rehti hain, isliye alag se upload folder ya image hosting nahi chahiye.

## Roz khabar kaise daalein

1. `yoursite/admin` kholein aur login karein.
2. **Add news** dabayein.
3. Headline, short summary, poori khabar likhein. Category chunein, main photo lagayein.
4. **Publish** dabayein. Khabar turant home page par aa jayegi.

Editor ke buttons:

| Button | Kaam |
|---|---|
| Bold / Heading / Quote / List | Text ko format karna |
| Link | Kisi website ka link lagana |
| Photo | Khabar ke beech me extra photo |
| YouTube | Video ka link paste karo, video khabar me dikhega |

Side ke options:

- **Show as top story**: khabar home page par sabse upar, bade peele box me dikhegi.
- **Breaking news**: home page par laal patti me 24 ghante tak dikhegi, phir apne aap hat jayegi.
- **Save as draft**: abhi public nahi hogi, baad me poori karke Publish karein.
- **Publish date and time**: aage ka time chunoge to khabar us time par apne aap publish hogi.

## Admin panel me kya-kya hai

- **All news**: saari khabrein, edit / delete / preview, views ki ginti, search aur filter.
- **Categories**: menu ke sections jodna, naam badalna, order badalna.
- **Settings**: site ka naam, tagline, bhasha (Hindi/English), contact, social links, password badalna.

## Public site me kya-kya hai

- Home page: top story, taza khabrein, breaking patti, "sabse zyada padhi gayi" list
- Category pages, search, har khabar ka apna page (`/news/12`)
- WhatsApp / Facebook / X share buttons aur link copy
- Mobile par poori tarah chalti hai, Hindi fonts andar hi hain
- `/sitemap.xml` (Google Search Console me submit karein), `/feed.xml` (RSS), `/robots.txt`

## Apne computer par chalana (optional)

Node.js 22.13 ya upar chahiye (nodejs.org se LTS).

- Windows: `start-local.bat` par double-click.
- Ya terminal me: `npm install` phir `npm start`, aur `http://localhost:3000` kholein.

Data `data/news.sqlite` me banega.

## Settings (environment variables)

| Naam | Kaam |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Set ho to data wahan jata hai. |
| `DATA_DIR` | SQLite mode me file ka folder (default `./data`). Disk wale server par disk ka path. |
| `PORT` | Port (default 3000; Render khud deta hai). |
| `ADMIN_PASSWORD_RESET` | Password bhoolne par: naya password yahan daal kar restart karo, phir hata do. |

## Rang ya shabd badalna

- Rang: `public/assets/css/style.css` ki shuruaat me `--indigo`, `--marigold` waghera.
- Site par dikhne wale shabd (jaise "Latest news"): `src/lang.js`.

## Folder structure

```
server.js              saare routes (public site + admin)
src/db.js              database (PostgreSQL ya SQLite)
src/core.js            login, cookies, dates, photos
src/render.js          khabar ke text ko HTML me badalna
src/views.js           public pages
src/admin-views.js     admin pages
src/lang.js            Hindi / English shabd
public/assets/         CSS, JS, fonts
render.yaml            Render ka setup
```
