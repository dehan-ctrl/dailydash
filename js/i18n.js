// UI language. English strings are the dictionary keys; missing entries fall
// back to English, so untranslated strings degrade gracefully. Stored in
// localStorage (not IndexedDB) deliberately: it must be readable synchronously
// at boot and before onboarding creates the settings record.
const KEY = 'mc-lang';
const store = globalThis.localStorage ?? { getItem: () => null, setItem: () => {} };
let lang = store.getItem(KEY) === 'tr' ? 'tr' : 'en';

export const getLang = () => lang;
export const locale = () => (lang === 'tr' ? 'tr-TR' : 'en-US');
export function setLang(l) {
  lang = l === 'tr' ? 'tr' : 'en';
  store.setItem(KEY, lang);
}

// {name} placeholders substitute AFTER lookup so Turkish word order and
// suffixes work: t('Add to {meal}', {meal}) → '{meal} öğününe ekle'.
export function t(s, vars) {
  let out = (lang === 'tr' && TR[s]) || s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

/* Language toggle chip. Shows the language you'd switch TO, so a Turkish
   speaker looking at an English screen immediately spots "TR". */
export function langChip() {
  return `<button class="ghost langchip" id="langchip" aria-label="Language">${lang === 'tr' ? 'EN' : 'TR'}</button>`;
}
export function wireLangChip(el, onChange) {
  const b = el.querySelector('#langchip');
  if (b) b.onclick = () => { setLang(lang === 'tr' ? 'en' : 'tr'); onChange(); };
}

/* Coach explanations are parametric sentences composed by the pure engine
   and stored verbatim in old check-ins, so they are translated here by
   pattern instead of exact key. */
const EXPLAIN_RULES = [
  [/Only (\d+)\/7 fully-logged days and (\d+) weigh-ins \(need 4 and 3\)\. Not enough data to coach honestly — targets held; log more this week\./,
    'Yalnızca $1/7 tam kayıtlı gün ve $2 tartı var (4 ve 3 gerekli). Dürüst koçluk için veri yetersiz — hedefler korundu; bu hafta daha çok kayıt tutun.'],
  [/Trend ([+-]?[\d.]+) kg this week vs target ([+-]?[\d.]+); average intake (\d+) kcal\/day; estimated TDEE (\d+) kcal\./,
    'Bu hafta trend $1 kg, hedef $2; ortalama alım günde $3 kcal; tahmini TDEE $4 kcal.'],
  [/Calories up (\d+) to (\d+) kcal\/day \(changes capped at ±(\d+)\/week\)\./,
    'Kalori $1 kcal artırıldı → günde $2 kcal (değişim haftada ±$3 ile sınırlı).'],
  [/Calories down (\d+) to (\d+) kcal\/day \(changes capped at ±(\d+)\/week\)\./,
    'Kalori $1 kcal azaltıldı → günde $2 kcal (değişim haftada ±$3 ile sınırlı).'],
  [/The needed change rounds to zero — holding\./, 'Gereken değişiklik sıfıra yuvarlanıyor — bekletiliyor.'],
  [/Reverse diet on track — nudging calories up\./, 'Ters diyet yolunda — kalori hafifçe artırılıyor.'],
  [/Gaining faster than the reverse-diet tolerance — holding until the trend settles\./,
    'Ters diyet toleransından daha hızlı kilo alımı — trend oturana dek bekletiliyor.'],
  [/Weight is inside the ±1% maintenance band\./, 'Kilo ±%1 koruma bandının içinde.'],
  [/Trend drifted below the maintenance band — steering back\./, 'Trend koruma bandının altına kaydı — geri yönlendiriliyor.'],
  [/Trend drifted above the maintenance band — steering back\./, 'Trend koruma bandının üstüne kaydı — geri yönlendiriliyor.'],
  [/On track — within the deadband\./, 'Yolunda — tolerans bandının içinde.'],
  [/Off the target rate — adjusting toward it\./, 'Hedef hızın dışında — ona doğru ayarlanıyor.'],
];
export function tExplain(text) {
  if (lang !== 'tr' || !text) return text;
  let out = text;
  for (const [re, tr] of EXPLAIN_RULES) out = out.replace(re, tr);
  return out;
}

export const TR = {
  /* app shell */
  'Diary': 'Günlük', 'Coach': 'Koç', 'Me': 'Ben', 'Settings': 'Ayarlar',
  'Something went wrong loading this screen.': 'Bu ekran yüklenirken bir sorun oluştu.',
  "It's been {label} since your last backup": 'Son yedeklemenizin üzerinden {label} geçti',
  'Export now': 'Şimdi dışa aktar',
  'Up to date': 'Güncel',
  'two weeks': 'iki hafta', 'a month': 'bir ay', '{n} days': '{n} gün', 'off': 'kapalı',

  /* meals & diary */
  'Breakfast': 'Kahvaltı', 'Lunch': 'Öğle Yemeği', 'Dinner': 'Akşam Yemeği', 'Snacks': 'Atıştırmalıklar',
  'Today, {date}': 'Bugün, {date}', 'Yesterday, {date}': 'Dün, {date}',
  'Consumed': 'Alınan', 'Remaining': 'Kalan',
  'Cal': 'Kalori', 'Protein': 'Protein', 'Carbs': 'Karbonhidrat', 'Fat': 'Yağ',
  'Using your custom targets (Settings → Macro targets).': 'Özel hedefleriniz kullanılıyor (Ayarlar → Makro hedefleri).',
  '📊 Planner': '📊 Planlayıcı',
  '{kcal} Cal, {p}p, {c}c, {f}f': '{kcal} Kal, {p}p, {c}k, {f}y',
  'Add to {meal}': '{meal} öğününe ekle',
  'Update {meal} entry': '{meal} kaydını güncelle',
  'quick add': 'hızlı ekleme', 'portion': 'porsiyon', '{qty} serving': '{qty} porsiyon',
  'Delete {label}': '{label} sil', 'Add to {meal} (button)': '{meal} öğününe ekle',
  'This food is no longer in your saved foods. Search or scan it again to edit its servings.':
    'Bu yiyecek artık kayıtlı yiyeceklerinizde yok. Porsiyonlarını düzenlemek için tekrar arayın veya taratın.',

  /* food picker */
  'Close': 'Kapat', 'Cancel': 'İptal',
  'My Foods': 'Yiyeceklerim',
  'Recent & My foods ({n})': 'Son & yiyeceklerim ({n})',
  'Search results': 'Arama sonuçları',
  '{n} results': '{n} sonuç', 'Recently used': 'Son kullanılan',
  'Find the foods you ate': 'Yediğiniz yiyecekleri bulun',
  'Search by food, brand name, or your favorites.': 'Yiyecek, marka adı veya favorilerinize göre arayın.',
  '+ New custom food': '+ Yeni özel yiyecek',
  'Foods you create will appear here.': 'Oluşturduğunuz yiyecekler burada görünecek.',
  'Add food': 'Yiyecek ekle', 'Update entry': 'Kaydı güncelle', 'Nutrition': 'Besin değerleri',
  'Search': 'Ara', 'Recent': 'Son', 'Custom': 'Özel', 'Recipes': 'Tarifler', 'Quick': 'Hızlı',
  'Search foods…': 'Yiyecek ara…', 'Searching...': 'Aranıyor...',
  '📷 Scan': '📷 Tara', 'More results': 'Daha fazla sonuç', 'View': 'Gör',
  'Foods you log will appear here.': 'Kaydettiğiniz yiyecekler burada görünecek.',
  '{kcal} kcal/100g': '{kcal} kcal/100g',
  'New custom food': 'Yeni özel yiyecek',
  'Name': 'Ad', 'barcode (optional)': 'barkod (isteğe bağlı)',
  'serving name (e.g. 2/3 cup)': 'porsiyon adı (örn. 1 kase)', 'grams': 'gram',
  'Macros per 100 g': '100 g başına makrolar',
  'Macros for {label} ({g} g)': '{label} ({g} g) için makrolar',
  'this serving': 'bu porsiyon',
  'Enter the macros for the serving above. Leave the serving blank to enter per 100 g instead.':
    'Yukarıdaki porsiyonun makrolarını girin. 100 g başına girmek için porsiyonu boş bırakın.',
  'Save food': 'Yiyeceği kaydet',
  'kcal': 'kcal', 'protein': 'protein', 'carbs': 'karbonhidrat', 'fat': 'yağ',
  'Quick add': 'Hızlı ekle', 'Label (optional)': 'Etiket (isteğe bağlı)',
  'protein g': 'protein g', 'carbs g': 'karbonhidrat g', 'fat g': 'yağ g', 'Add': 'Ekle',

  /* food detail & edit */
  '‹ Back': '‹ Geri', 'Edit': 'Düzenle', 'Serving': 'Porsiyon',
  'How many servings? (0.5 = half)': 'Kaç porsiyon? (0,5 = yarım)',
  'Calories': 'Kalori',
  'Serving macros are entered directly for {label}.': '{label} için makrolar doğrudan girilmiştir.',
  '‹ Cancel': '‹ Vazgeç', 'Edit food': 'Yiyeceği düzenle',
  'Barcode (optional)': 'Barkod (isteğe bağlı)', 'Scan or type barcode': 'Barkodu tarayın veya yazın',
  'Protein (g)': 'Protein (g)', 'Carbs (g)': 'Karb. (g)', 'Fat (g)': 'Yağ (g)',
  '100 g is calculated from {label} ({grams} g).': '100 g değeri {label} ({grams} g) porsiyonundan hesaplanır.',
  'Servings': 'Porsiyonlar', '100 g (always available)': '100 g (her zaman var)',
  'e.g. 1 cup': 'örn. 1 kase',
  'Each serving can be gram-based, macro-based, or both. If you enter macros, the app will use them for that serving instead of scaling from 100 g.':
    'Her porsiyon gram, makro veya ikisiyle birden tanımlanabilir. Makro girerseniz uygulama o porsiyon için 100 g yerine bu değerleri kullanır.',

  /* barcode scanning */
  'Point the camera at a barcode…': 'Kamerayı barkoda doğrultun…', 'Stop': 'Durdur',
  'Light': 'Işık', 'Enter barcode': 'Barkod girin', 'Lookup': 'Ara',
  'Enter a valid barcode.': 'Geçerli bir barkod girin.',
  'Looking up {code}…': '{code} aranıyor…',
  'No product found for {code}.': '{code} için ürün bulunamadı.',
  'Scanner library not loaded.': 'Tarayıcı kitaplığı yüklenemedi.',
  'This browser has no camera access.': 'Bu tarayıcıda kamera erişimi yok.',
  'Camera permission was denied. Allow camera access for MacroCoach in Settings and try again.':
    'Kamera izni reddedildi. Ayarlar\'dan MacroCoach için kameraya izin verin ve tekrar deneyin.',
  'No usable camera was found on this device.': 'Bu cihazda kullanılabilir kamera bulunamadı.',
  'The camera is in use by another app.': 'Kamera başka bir uygulama tarafından kullanılıyor.',
  'Camera unavailable.': 'Kamera kullanılamıyor.',

  /* search messages */
  'Showing USDA results with the shared app key. Add your own USDA key in Settings if searches start rate-limiting.':
    'Ortak uygulama anahtarıyla USDA sonuçları gösteriliyor. Aramalar yavaşlarsa Ayarlar\'dan kendi USDA anahtarınızı ekleyin.',
  'Showing USDA results. Packaged-food search is temporarily unavailable.':
    'USDA sonuçları gösteriliyor. Paketli gıda araması geçici olarak kullanılamıyor.',
  'Showing packaged-food results. The shared USDA key may be rate-limited; add your own key in Settings for more reliability.':
    'Paketli gıda sonuçları gösteriliyor. Ortak USDA anahtarı sınırlanmış olabilir; daha güvenilir olması için Ayarlar\'dan kendi anahtarınızı ekleyin.',
  'Showing packaged-food results. USDA search is temporarily unavailable.':
    'Paketli gıda sonuçları gösteriliyor. USDA araması geçici olarak kullanılamıyor.',
  'Food search is temporarily unavailable ({errors}). Try again, add a custom food, or add your own USDA key in Settings.':
    'Yiyecek araması geçici olarak kullanılamıyor ({errors}). Tekrar deneyin, özel yiyecek ekleyin veya Ayarlar\'dan kendi USDA anahtarınızı ekleyin.',
  'No foods with usable nutrition found for "{query}". Try another search or add a custom food.':
    '"{query}" için kullanılabilir besin değeri olan yiyecek bulunamadı. Başka bir arama deneyin veya özel yiyecek ekleyin.',
  'Food search is temporarily unavailable: {message}': 'Yiyecek araması geçici olarak kullanılamıyor: {message}',
  'USDA search was skipped — the query could not be translated to English.':
    'USDA araması atlandı — sorgu İngilizceye çevrilemedi.',

  /* recipes */
  '{kcal} kcal/serving · makes {n}': '{kcal} kcal/porsiyon · {n} porsiyonluk',
  'No recipes yet.': 'Henüz tarif yok.', '+ New recipe': '+ Yeni tarif', 'New recipe': 'Yeni tarif',
  'Recipe name': 'Tarif adı', 'Servings it makes': 'Kaç porsiyon çıkar',
  'Search ingredient…': 'Malzeme ara…', 'Ingredients': 'Malzemeler', 'Save recipe': 'Tarifi kaydet',
  'recipe': 'tarif', 'serving': 'porsiyon',

  /* coach */
  'Lose weight': 'Kilo ver', 'Gain weight': 'Kilo al', 'Maintain': 'Koru', 'Reverse diet': 'Ters diyet',
  'hold steady': 'sabit tut', 'calories up, weight steady': 'kalori artar, kilo sabit',
  '{u}/week': '{u}/hafta',
  'Start': 'Başlangıç', 'Current (trend)': 'Şimdi (trend)', 'Goal': 'Hedef',
  'Goal progress {pct}%': 'Hedef ilerlemesi %{pct}',
  '{pct}% to goal': 'Hedefe %{pct}', '{amount} left': '{amount} kaldı',
  'Progress appears for lose/gain goals once weigh-ins exist.':
    'İlerleme, ver/al hedeflerinde tartı kayıtları oluşunca görünür.',
  'Set a goal weight to track progress.': 'İlerlemeyi izlemek için hedef kilo belirleyin.',
  '✏️ Change goal': '✏️ Hedefi değiştir', '＋ Add weight': '＋ Kilo ekle',
  "Today's weight ({u})": 'Bugünkü kilo ({u})', 'Save': 'Kaydet',
  'Check-in is due': 'Haftalık kontrol zamanı', 'Run check-in': 'Kontrolü başlat',
  'Current period': 'Bu dönem', 'Last check in': 'Son kontrol', 'Next check in': 'Sonraki kontrol',
  'Check-in available': 'Kontrol hazır',
  '{n} days until your next check-in': 'Sonraki kontrole {n} gün',
  '1 day until your next check-in': 'Sonraki kontrole 1 gün',
  'Compliance': 'Uyum', 'Include today': 'Bugünü dahil et',
  'Targets': 'Hedefler', 'Tracked (Avg)': 'Kayıt (Ort.)',
  '✓ You are currently compliant.': '✓ Şu anda hedeflerine uyuyorsun.',
  '✕ You are currently not compliant.': '✕ Şu anda hedeflerine uymuyorsun.',
  'Log some food to see period compliance.': 'Dönem uyumunu görmek için yemek kaydedin.',
  'Prescription': 'Reçete', 'custom targets': 'özel hedefler',
  'coach · since {date}': 'koç · {date} tarihinden beri',
  'Estimated TDEE: {n} kcal': 'Tahmini TDEE: {n} kcal',
  '(learned from your data)': '(verilerinizden öğrenildi)', '(formula estimate)': '(formül tahmini)',
  'Check-in history': 'Kontrol geçmişi', 'No check-ins yet.': 'Henüz kontrol yok.',
  "This week's check-in": 'Bu haftanın kontrolü', 'New targets:': 'Yeni hedefler:',
  'Heads-up: you are on custom targets, so the coach update is recorded but your custom numbers stay in charge until you switch back in Settings.':
    'Not: Özel hedefler kullanıyorsunuz; koç güncellemesi kaydedilir ama Ayarlar\'dan geri dönene kadar sizin sayılarınız geçerli kalır.',
  'Apply new targets': 'Yeni hedefleri uygula', 'Record check-in': 'Kontrolü kaydet',
  'hold': 'beklet', 'adjust': 'ayarla', 'insufficient': 'yetersiz',

  /* me */
  'Body values': 'Vücut değerleri', 'Weight': 'Kilo',
  "Log today's weight ({u})": 'Bugünkü kiloyu kaydet ({u})',
  'Body fat': 'Vücut yağı', 'Log body fat %': 'Vücut yağı % kaydet',
  'Lean body mass': 'Yağsız vücut kütlesi', 'add body fat %': 'vücut yağı % ekleyin',
  'Maintenance calories': 'Koruma kalorisi', 'learns after check-ins': 'kontrollerden sonra öğrenilir',
  'Weight trend': 'Kilo trendi', 'Weigh in to see your trend.': 'Trendinizi görmek için tartılın.',
  'Calories vs target': 'Kalori vs hedef', 'Logging adherence': 'Kayıt düzenliliği',
  '{n}/7 days': '{n}/7 gün', 'Maintenance over time': 'Zaman içinde koruma',
  'Appears after two check-ins.': 'İki kontrolden sonra görünür.', 'today': 'bugün',

  /* settings */
  'Users': 'Kullanıcılar', 'Current user': 'Mevcut kullanıcı',
  'Add user': 'Kullanıcı ekle', 'Rename': 'Ad değiştir', 'Delete': 'Sil',
  'Each user has separate logs, targets, foods, recipes, recents, and favorites on this device.':
    'Her kullanıcının bu cihazda ayrı kayıtları, hedefleri, yiyecekleri, tarifleri, son kullanılanları ve favorileri vardır.',
  'Coach settings': 'Koç ayarları',
  'Rate ({u} per week — how fast to lose/gain)': 'Hız (haftada {u} — ne hızda ver/al)',
  'Goal weight ({u}, optional)': 'Hedef kilo ({u}, isteğe bağlı)',
  'Check-in day': 'Kontrol günü',
  'Monday': 'Pazartesi', 'Tuesday': 'Salı', 'Wednesday': 'Çarşamba', 'Thursday': 'Perşembe',
  'Friday': 'Cuma', 'Saturday': 'Cumartesi', 'Sunday': 'Pazar',
  'Macro targets': 'Makro hedefleri', 'From Coach': 'Koçtan',
  'The coach keeps adjusting its numbers weekly. Custom stays exactly what you type until you change it.':
    'Koç sayılarını her hafta ayarlamaya devam eder. Özel, siz değiştirene kadar tam yazdığınız gibi kalır.',
  'Save macro targets': 'Makro hedeflerini kaydet',
  'Diet preferences': 'Diyet tercihleri', 'Diet type': 'Diyet türü',
  'Balanced': 'Dengeli', 'Low-fat': 'Az yağlı', 'Low-carb': 'Az karbonhidratlı', 'Keto': 'Keto',
  'Plant-based (protein set to 1.8 g/kg)': 'Bitkisel (protein 1,8 g/kg)',
  'Plant-based (protein 1.8 g/kg)': 'Bitkisel (protein 1,8 g/kg)',
  'Profile': 'Profil', 'Units': 'Birimler', 'Height': 'Boy',
  'Body fat % (optional — makes calorie math more accurate)':
    'Vücut yağı % (isteğe bağlı — kalori hesabını daha doğru yapar)',
  'e.g. 18': 'örn. 18',
  'Activity level (outside workouts)': 'Aktivite düzeyi (antrenman dışında)',
  'Save & update coach targets': 'Kaydet ve koç hedeflerini güncelle',
  "Saving recalculates the coach's numbers — using your learned TDEE once check-ins exist.":
    'Kaydetmek koçun sayılarını yeniden hesaplar — kontroller oluştukça öğrenilen TDEE kullanılır.',
  'Food database': 'Yiyecek veritabanı',
  'USDA FoodData Central API key (optional)': 'USDA FoodData Central API anahtarı (isteğe bağlı)',
  'free key from fdc.nal.usda.gov': 'fdc.nal.usda.gov adresinden ücretsiz anahtar',
  'Save key': 'Anahtarı kaydet',
  'Data': 'Veriler',
  'Everything lives on this device. Export a backup regularly.':
    'Her şey bu cihazda durur. Düzenli olarak yedek alın.',
  'Backup reminder': 'Yedekleme hatırlatıcısı',
  'Every 2 weeks': '2 haftada bir', 'Monthly': 'Aylık', 'Off': 'Kapalı',
  'Export backup': 'Yedeği dışa aktar', 'Import backup': 'Yedeği içe aktar',
  'Erase all data': 'Tüm verileri sil',
  'Name for the new user?': 'Yeni kullanıcının adı?',
  'New name for this user?': 'Bu kullanıcı için yeni ad?',
  'Delete {name} and all of their data on this device? This cannot be undone.':
    '{name} ve bu cihazdaki tüm verileri silinsin mi? Bu geri alınamaz.',
  'this user': 'bu kullanıcı',
  'Erase ALL MacroCoach data on this device? This cannot be undone.':
    'Bu cihazdaki TÜM MacroCoach verileri silinsin mi? Bu geri alınamaz.',
  'Import failed: {message}': 'İçe aktarma başarısız: {message}',
  'Sedentary — desk job, little exercise': 'Hareketsiz — masa başı iş, az egzersiz',
  'Lightly active — 1–3 workouts/week': 'Az aktif — haftada 1–3 antrenman',
  'Moderately active — 3–5 workouts/week': 'Orta aktif — haftada 3–5 antrenman',
  'Very active — 6–7 workouts/week': 'Çok aktif — haftada 6–7 antrenman',
  'Extremely active — physical job + training': 'Aşırı aktif — fiziksel iş + antrenman',

  /* planner */
  '‹ Diary': '‹ Günlük', 'Calorie planner': 'Kalori planlayıcı',
  'Plan high and low days': 'Yüksek ve düşük günler planlayın', 'On': 'Açık',
  'Shift calories between days — the weekly total stays {n} kcal. Lock days to pin them.':
    'Kalorileri günler arasında kaydırın — haftalık toplam {n} kcal kalır. Sabitlemek için günleri kilitleyin.',
  'Mon': 'Pzt', 'Tue': 'Sal', 'Wed': 'Çar', 'Thu': 'Per', 'Fri': 'Cum', 'Sat': 'Cmt', 'Sun': 'Paz',
  'Weekly total': 'Haftalık toplam', 'Even out week': 'Haftayı eşitle',
  'That day is locked. Unlock it to edit.': 'O gün kilitli. Düzenlemek için kilidi açın.',
  'Every other day is locked — nowhere to redistribute.': 'Diğer tüm günler kilitli — dağıtacak yer yok.',
  'Clamped to {kcal} kcal — no other day can go below {floor} kcal.':
    '{kcal} kcal ile sınırlandı — başka hiçbir gün {floor} kcal altına inemez.',

  /* onboarding */
  'Step {n} of 4': 'Adım {n}/4',
  'Welcome to MacroCoach': "MacroCoach'a hoş geldiniz",
  'Sex': 'Cinsiyet', 'Male': 'Erkek', 'Female': 'Kadın', 'Birthdate': 'Doğum tarihi',
  'feet / inches': 'feet / inç', 'Current weight ({u})': 'Mevcut kilo ({u})',
  'Body fat % (optional — improves the calorie estimate)':
    'Vücut yağı % (isteğe bağlı — kalori tahminini iyileştirir)',
  'skip if unsure': 'emin değilseniz boş bırakın',
  'Next': 'İleri', 'Your goal': 'Hedefiniz',
  'Lose': 'Ver', 'Gain': 'Al', 'Reverse': 'Ters',
  'Rate:': 'Hız:', 'Goal weight ({u})': 'Hedef kilo ({u})',
  'Start at estimated maintenance; calories climb week by week while weight stays stable.':
    'Tahmini koruma kalorisinden başlayın; kilo sabit kalırken kaloriler hafta hafta artar.',
  'Diet style': 'Diyet tarzı',
  'Your daily targets': 'Günlük hedefleriniz',
  'Tweak grams if you like — calories stay fixed; the other macros rebalance.':
    'İsterseniz gramları ayarlayın — kaloriler sabit kalır, diğer makrolar yeniden dengelenir.',
  'est. TDEE {n}': 'tah. TDEE {n}',
  'Weekly check-in day': 'Haftalık kontrol günü',
  'Adjusted to stay within safe ranges.': 'Güvenli aralıkta kalması için ayarlandı.',
  'Start coaching': 'Koçluğu başlat',
};
