// Turkish → English food-term dictionary for bridging Turkish search queries
// to the English-only USDA database. Pure. Full phrases first, then
// word-by-word; returns null when any word is unknown (caller may fall back
// to an online translator).

const DICT = {
  /* proteins */
  'tavuk': 'chicken', 'tavuk göğsü': 'chicken breast', 'tavuk gogsu': 'chicken breast',
  'tavuk but': 'chicken thigh', 'tavuk kanat': 'chicken wing', 'hindi': 'turkey',
  'dana': 'beef', 'dana eti': 'beef', 'sığır': 'beef', 'sigir': 'beef',
  'kıyma': 'ground beef', 'kiyma': 'ground beef', 'kuzu': 'lamb', 'kuzu eti': 'lamb',
  'et': 'meat', 'biftek': 'steak', 'bonfile': 'tenderloin', 'antrikot': 'ribeye',
  'köfte': 'meatball', 'kofte': 'meatball', 'sucuk': 'sujuk sausage', 'sosis': 'sausage',
  'salam': 'salami', 'pastırma': 'pastrami', 'pastirma': 'pastrami', 'jambon': 'ham',
  'balık': 'fish', 'balik': 'fish', 'somon': 'salmon', 'ton balığı': 'tuna',
  'ton baligi': 'tuna', 'ton': 'tuna', 'levrek': 'sea bass', 'çipura': 'sea bream',
  'cipura': 'sea bream', 'hamsi': 'anchovy', 'sardalya': 'sardine', 'uskumru': 'mackerel',
  'karides': 'shrimp', 'midye': 'mussel', 'ahtapot': 'octopus', 'kalamar': 'squid',
  'yumurta': 'egg', 'yumurtalar': 'eggs', 'yumurta beyazı': 'egg white',
  'yumurta beyazi': 'egg white', 'yumurta sarısı': 'egg yolk', 'yumurta sarisi': 'egg yolk',

  /* dairy */
  'süt': 'milk', 'sut': 'milk', 'yoğurt': 'yogurt', 'yogurt': 'yogurt',
  'süzme yoğurt': 'strained yogurt', 'suzme yogurt': 'strained yogurt',
  'ayran': 'ayran yogurt drink', 'kefir': 'kefir',
  'peynir': 'cheese', 'beyaz peynir': 'feta cheese', 'kaşar': 'kashkaval cheese',
  'kasar': 'kashkaval cheese', 'kaşar peyniri': 'kashkaval cheese',
  'lor': 'curd cheese', 'labne': 'labneh', 'krem peynir': 'cream cheese',
  'çökelek': 'cottage cheese', 'cokelek': 'cottage cheese', 'hellim': 'halloumi',
  'tereyağı': 'butter', 'tereyagi': 'butter', 'kaymak': 'clotted cream', 'krema': 'cream',
  'süzme peynir': 'cottage cheese', 'suzme peynir': 'cottage cheese',

  /* grains & bakery */
  'ekmek': 'bread', 'ekmeği': 'bread', 'ekmegi': 'bread',
  'tam buğday': 'whole wheat', 'tam bugday': 'whole wheat',
  'tam buğday ekmeği': 'whole wheat bread', 'tam bugday ekmegi': 'whole wheat bread',
  'çavdar': 'rye', 'cavdar': 'rye', 'çavdar ekmeği': 'rye bread',
  'simit': 'simit bagel', 'lavaş': 'lavash', 'lavas': 'lavash', 'pide': 'pita bread',
  'yufka': 'phyllo dough', 'makarna': 'pasta', 'spagetti': 'spaghetti',
  'pirinç': 'rice', 'pirinc': 'rice', 'pilav': 'cooked rice', 'bulgur': 'bulgur',
  'esmer pirinç': 'brown rice', 'esmer pirinc': 'brown rice',
  'yulaf': 'oats', 'yulaf ezmesi': 'oatmeal', 'müsli': 'muesli', 'musli': 'muesli',
  'granola': 'granola', 'mısır gevreği': 'corn flakes', 'misir gevregi': 'corn flakes',
  'un': 'flour', 'irmik': 'semolina', 'kuskus': 'couscous', 'kinoa': 'quinoa',
  'kraker': 'cracker', 'galeta': 'rusk', 'grissini': 'breadstick',

  /* legumes, nuts, seeds */
  'mercimek': 'lentils', 'kırmızı mercimek': 'red lentils', 'kirmizi mercimek': 'red lentils',
  'nohut': 'chickpeas', 'fasulye': 'beans', 'kuru fasulye': 'white beans',
  'barbunya': 'borlotti beans', 'bezelye': 'peas', 'bakla': 'fava beans',
  'soya': 'soy', 'soya fasulyesi': 'soybeans', 'tofu': 'tofu',
  'fındık': 'hazelnut', 'findik': 'hazelnut', 'fıstık': 'peanut', 'fistik': 'peanut',
  'yer fıstığı': 'peanut', 'yer fistigi': 'peanut', 'antep fıstığı': 'pistachio',
  'antep fistigi': 'pistachio', 'badem': 'almond', 'ceviz': 'walnut', 'kaju': 'cashew',
  'ay çekirdeği': 'sunflower seeds', 'ay cekirdegi': 'sunflower seeds',
  'kabak çekirdeği': 'pumpkin seeds', 'kabak cekirdegi': 'pumpkin seeds',
  'chia': 'chia', 'keten tohumu': 'flaxseed', 'susam': 'sesame', 'tahin': 'tahini',
  'fıstık ezmesi': 'peanut butter', 'fistik ezmesi': 'peanut butter',
  'badem ezmesi': 'almond butter',

  /* vegetables */
  'domates': 'tomato', 'salatalık': 'cucumber', 'salatalik': 'cucumber',
  'biber': 'pepper', 'yeşil biber': 'green pepper', 'yesil biber': 'green pepper',
  'kırmızı biber': 'red pepper', 'kirmizi biber': 'red pepper',
  'patlıcan': 'eggplant', 'patlican': 'eggplant', 'kabak': 'zucchini',
  'patates': 'potato', 'tatlı patates': 'sweet potato', 'tatli patates': 'sweet potato',
  'soğan': 'onion', 'sogan': 'onion', 'sarımsak': 'garlic', 'sarimsak': 'garlic',
  'havuç': 'carrot', 'havuc': 'carrot', 'brokoli': 'broccoli', 'karnabahar': 'cauliflower',
  'ıspanak': 'spinach', 'ispanak': 'spinach', 'marul': 'lettuce', 'roka': 'arugula',
  'maydanoz': 'parsley', 'dereotu': 'dill', 'nane': 'mint', 'lahana': 'cabbage',
  'kırmızı lahana': 'red cabbage', 'pırasa': 'leek', 'pirasa': 'leek',
  'kereviz': 'celery', 'enginar': 'artichoke', 'kuşkonmaz': 'asparagus',
  'kuskonmaz': 'asparagus', 'mantar': 'mushroom', 'mısır': 'corn', 'misir': 'corn',
  'turp': 'radish', 'pancar': 'beet', 'bamya': 'okra', 'taze fasulye': 'green beans',
  'avokado': 'avocado', 'salata': 'salad', 'turşu': 'pickles', 'tursu': 'pickles',
  'zeytin': 'olives', 'siyah zeytin': 'black olives', 'yeşil zeytin': 'green olives',
  'yesil zeytin': 'green olives',

  /* fruit */
  'elma': 'apple', 'armut': 'pear', 'muz': 'banana', 'portakal': 'orange',
  'mandalina': 'tangerine', 'limon': 'lemon', 'greyfurt': 'grapefruit',
  'çilek': 'strawberry', 'cilek': 'strawberry', 'ahududu': 'raspberry',
  'böğürtlen': 'blackberry', 'bogurtlen': 'blackberry', 'yaban mersini': 'blueberry',
  'kiraz': 'cherry', 'vişne': 'sour cherry', 'visne': 'sour cherry',
  'üzüm': 'grapes', 'uzum': 'grapes', 'karpuz': 'watermelon', 'kavun': 'melon',
  'şeftali': 'peach', 'seftali': 'peach', 'kayısı': 'apricot', 'kayisi': 'apricot',
  'erik': 'plum', 'nar': 'pomegranate', 'incir': 'fig', 'hurma': 'date',
  'kivi': 'kiwi', 'ananas': 'pineapple', 'mango': 'mango',
  'kuru üzüm': 'raisins', 'kuru uzum': 'raisins', 'kuru kayısı': 'dried apricot',
  'kuru kayisi': 'dried apricot', 'kuru incir': 'dried fig',

  /* dishes & prepared */
  'çorba': 'soup', 'corba': 'soup', 'mercimek çorbası': 'lentil soup',
  'mercimek corbasi': 'lentil soup', 'tavuk çorbası': 'chicken soup',
  'domates çorbası': 'tomato soup', 'menemen': 'menemen scrambled eggs with tomato',
  'omlet': 'omelette', 'sahanda yumurta': 'fried egg', 'haşlanmış yumurta': 'boiled egg',
  'haslanmis yumurta': 'boiled egg', 'döner': 'doner kebab', 'doner': 'doner kebab',
  'kebap': 'kebab', 'adana kebap': 'adana kebab', 'şiş kebap': 'shish kebab',
  'sis kebap': 'shish kebab', 'lahmacun': 'lahmacun turkish pizza',
  'mantı': 'manti dumplings', 'manti': 'manti dumplings',
  'dolma': 'stuffed grape leaves', 'sarma': 'stuffed grape leaves',
  'imam bayıldı': 'stuffed eggplant', 'karnıyarık': 'stuffed eggplant with meat',
  'karniyarik': 'stuffed eggplant with meat', 'menemen tava': 'menemen',
  'pizza': 'pizza', 'hamburger': 'hamburger', 'sandviç': 'sandwich', 'sandvic': 'sandwich',
  'tost': 'grilled cheese sandwich', 'patates kızartması': 'french fries',
  'patates kizartmasi': 'french fries', 'cips': 'chips',
  'çikolata': 'chocolate', 'cikolata': 'chocolate', 'bitter çikolata': 'dark chocolate',
  'sütlü çikolata': 'milk chocolate', 'dondurma': 'ice cream', 'kek': 'cake',
  'kurabiye': 'cookie', 'bisküvi': 'biscuit', 'biskuvi': 'biscuit',
  'baklava': 'baklava', 'künefe': 'kunefe', 'kunefe': 'kunefe', 'helva': 'halva',
  'lokum': 'turkish delight', 'sütlaç': 'rice pudding', 'sutlac': 'rice pudding',
  'muhallebi': 'milk pudding', 'bal': 'honey', 'reçel': 'jam', 'recel': 'jam',
  'pekmez': 'grape molasses', 'şeker': 'sugar', 'seker': 'sugar',

  /* drinks */
  'su': 'water', 'maden suyu': 'mineral water', 'çay': 'tea', 'cay': 'tea',
  'yeşil çay': 'green tea', 'yesil cay': 'green tea', 'kahve': 'coffee',
  'türk kahvesi': 'turkish coffee', 'turk kahvesi': 'turkish coffee',
  'filtre kahve': 'filter coffee', 'latte': 'latte', 'meyve suyu': 'fruit juice',
  'portakal suyu': 'orange juice', 'elma suyu': 'apple juice', 'limonata': 'lemonade',
  'kola': 'cola', 'gazoz': 'soda', 'bira': 'beer', 'şarap': 'wine', 'sarap': 'wine',
  'protein tozu': 'protein powder', 'protein shake': 'protein shake',

  /* fats, condiments, misc */
  'zeytinyağı': 'olive oil', 'zeytinyagi': 'olive oil', 'zeytin yağı': 'olive oil',
  'ayçiçek yağı': 'sunflower oil', 'aycicek yagi': 'sunflower oil', 'yağ': 'oil',
  'yag': 'oil', 'sirke': 'vinegar', 'ketçap': 'ketchup', 'ketcap': 'ketchup',
  'mayonez': 'mayonnaise', 'hardal': 'mustard', 'salça': 'tomato paste',
  'salca': 'tomato paste', 'humus': 'hummus', 'cacık': 'tzatziki', 'cacik': 'tzatziki',
  'tuz': 'salt', 'karabiber': 'black pepper', 'pul biber': 'red pepper flakes',
  'kimyon': 'cumin', 'kekik': 'thyme', 'tarçın': 'cinnamon', 'tarcin': 'cinnamon',
  'vanilya': 'vanilla', 'kakao': 'cocoa', 'protein bar': 'protein bar',

  /* descriptors that survive word-by-word translation */
  'ızgara': 'grilled', 'izgara': 'grilled', 'haşlanmış': 'boiled', 'haslanmis': 'boiled',
  'fırında': 'baked', 'firinda': 'baked', 'kızarmış': 'fried', 'kizarmis': 'fried',
  'çiğ': 'raw', 'cig': 'raw', 'pişmiş': 'cooked', 'pismis': 'cooked',
  'taze': 'fresh', 'kuru': 'dried', 'dondurulmuş': 'frozen', 'dondurulmus': 'frozen',
  'yağsız': 'nonfat', 'yagsiz': 'nonfat', 'az yağlı': 'low fat', 'az yagli': 'low fat',
  'tam yağlı': 'whole fat', 'tam yagli': 'whole fat', 'light': 'light',
  'şekersiz': 'sugar free', 'sekersiz': 'sugar free', 'tam': 'whole',
  'beyaz': 'white', 'esmer': 'brown', 'siyah': 'black', 'göğsü': 'breast', 'gogsu': 'breast',
};

export function trFoodToEn(query) {
  const q = String(query || '').toLocaleLowerCase('tr').trim().replace(/\s+/g, ' ');
  if (!q) return null;
  if (DICT[q]) return DICT[q];
  const words = q.split(' ').map((w) => DICT[w] ?? null);
  if (words.length > 1 && words.every(Boolean)) return words.join(' ');
  return null;
}
