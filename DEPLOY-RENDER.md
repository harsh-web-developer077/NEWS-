# Render par deploy karna (GitHub ke through, bina Docker)

Ye Node.js version hai. Render par Node seedha chalta hai, isliye Docker ki zaroorat nahi.

## Pehle ye samajh lo: data kahan rehta hai

Render ke Free plan par server ki files permanent nahi hoti: 15 minute koi visitor na aaye to service so jati hai aur server par rakhi files mit jati hain. Isliye is site me khabrein, photos aur login ek **alag database** me rehte hain, server par nahi. Database ke liye yahan **Neon** (free PostgreSQL) use kiya gaya hai.

Teen cheezein banengi, teeno free:

1. **Neon**: database (khabrein + photos yahin save hongi)
2. **GitHub**: code
3. **Render**: website chalane ke liye

## Step 1: Neon par database banana

1. neon.com par sign up karo (GitHub se login chal jata hai, card nahi maangta).
2. **Create project** dabao. Naam kuch bhi (jaise `news`), region me **Singapore** chuno (India ke sabse paas).
3. Project banne ke baad **Connect** button dabao. Ek lamba **connection string** dikhega jo `postgresql://` se shuru hota hai aur jisme `neon.tech` aata hai.
4. Use copy karke kahin rakh lo. Ye aapke database ki chaabi hai, kisi ko mat dena aur GitHub par mat daalna.

## Step 2: GitHub par code daalna

1. github.com par **New repository** banao (naam jaise `news-site`). "Add a README" tick mat karna.
2. Zip ko computer par extract karo.
3. Repository page par **uploading an existing file** link dabao.
4. Extract kiye folder ke **andar ki saari files aur folders** select karke (Ctrl+A) us page par drag karo.
5. **Commit changes** dabao.

Check: repository ke pehle page par `server.js`, `package.json`, `render.yaml`, `src`, `public` seedhe dikhne chahiye, kisi extra folder ke andar nahi. `node_modules` folder upload nahi karna hai (zip me hai bhi nahi).

## Step 3: Render par deploy

1. render.com par **GitHub se login** karo.
2. Dashboard me **New > Blueprint** chuno aur apni repository select karo.
3. Render `render.yaml` padh kar `news-site` service dikhayega aur **DATABASE_URL** ki value poochega. Wahan Step 1 wala Neon connection string paste karo.
4. **Apply / Deploy Blueprint** dabao.
5. Build 2 se 4 minute leta hai. "Live" dikhne par upar diya `https://news-site-xxxx.onrender.com` link kholo.
6. **Set up** page aayega: site ka naam, bhasha, admin username/password bharo. Ho gaya.

Blueprint na chale to haath se bhi ho jata hai: **New > Web Service** > repository chuno > Language **Node** > Build Command `npm install` > Start Command `node server.js` > Instance Type **Free** > Environment Variables me `DATABASE_URL` (Neon string) aur `NODE_VERSION` = `22.22.0` daalo > **Deploy**.

## Pehle se site chal rahi hai aur sirf naya design chahiye?

GitHub repository me purani files ki jagah is zip ki files upload kar do (same naam wali files replace ho jayengi). Render apne aap dobara deploy karega. Database wahi rehta hai, isliye purani khabrein aur login waise hi rahenge. Naye features ke liye jo tables chahiye (jaise Pages aur Messages) wo pehli baar chalte hi apne aap ban jati hain, aur About/Contact pages bhi apne aap jud jate hain.

## Email par copy (optional, free)

Website apni khabrein hamesha database (Neon) se padhti hai. Email **doosri, safe copy** ke liye hai:

- har khabar publish hote hi aapki email par aa jati hai (main photo attach ke saath)
- poori backup file hafte me ek baar apne aap aati hai
- Contact page ke messages bhi email par aate hain

Render ka Free plan seedha email bhejna block karta hai, isliye ek free email service **Resend** lagti hai:

1. resend.com par account banao, **usi email se jis par copies chahiye** (jaise aapka Gmail). Free plan me bina apna domain jode email sirf usi address par ja sakti hai jisse account bana hai.
2. Resend me **API Keys** kholo, **Create API Key** dabao aur key copy kar lo (`re_` se shuru hoti hai). Ye sirf ek baar dikhti hai.
3. Render me apni service > **Environment** > **Add Environment Variable**: naam `RESEND_API_KEY`, value me wo key. **Save** dabao; site apne aap restart hogi.
4. Site ke Admin > **Backup** me "Your email address" me apna address likh kar **Save email choices** dabao.
5. **Email a backup now** dabao. Inbox me backup file wali email aani chahiye. Pehli baar na dikhe to **Spam** folder dekho aur "Not spam" kar do.

Dhyan rahe:

- Free plan me din ki 100 aur mahine ki 3,000 emails ki limit hai; ek news site ke liye kaafi hai.
- Backup email me photos tab tak saath aati hain jab tak sab photos milakar lagbhag 12 MB se kam hain. Uske baad email me sirf khabrein aati hain, aur photos wali file Admin > Backup se download karni hoti hai.
- Email on karne se **pehle** ki khabrein ek-ek karke nahi bheji jati; wo backup file ke andar hoti hain.
- Key kabhi GitHub par mat daalna, sirf Render ke Environment me.

## Free plan ki do baatein

- **Pehli baar kholne me der:** 15 minute koi na aaye to site so jati hai; agla visitor aane par jaagne me lagbhag 1 minute lagta hai. Uske baad normal chalti hai. Khabrein nahi mitti, kyunki wo Neon me hain.
- **Photos database me jati hain:** admin panel badi photos ko upload se pehle apne aap chhota kar deta hai (lagbhag 150 se 300 KB per photo). Neon ke free plan ki storage limit unke pricing page par dekh lena; hazaaron photos ke baad paid plan ya purani photos hatana padega.

## Baad me kaam ki baatein

- **Backup:** Admin > Backup se saari khabrein (aur photos) ek file me download ho jati hain. Hafte me ek baar download karke khud ko email kar do ya Google Drive me rakh do. Kabhi database badalna pade to nayi site par wahi file **Restore** kar do.
- **Site update karna:** GitHub par file badlo. Render apne aap dobara deploy kar deta hai, data waisa hi rehta hai.
- **Apna domain:** Render me service > Settings > Custom Domains. Phir Admin > Settings me "Website address" me apna domain daal do.
- **Password bhool gaye:** Render me service > Environment me `ADMIN_PASSWORD_RESET` naam ka variable banao, value me naya password (kam se kam 8 akshar). Save karo, service restart hogi, naye password se login karo, phir wo variable **hata do**.
- **Admin panel me peeli chetavni dikhe** ("This server does not keep files"): iska matlab `DATABASE_URL` set nahi hai. Render > Environment me use daalo.
- **Paid plan + disk lena ho (Neon ke bina):** service me persistent disk lagao (mount path `/var/data`), environment me `DATA_DIR` = `/var/data` daalo aur `DATABASE_URL` hata do. Tab data disk par SQLite file me rahega.
