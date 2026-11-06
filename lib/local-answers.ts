// FOODLENS local answers: a no-key, in-browser knowledge base.
//
// When no API key is saved for the selected provider, the chat UI calls
// answerLocally() instead of failing. Everything here is curated general
// guidance — no exact ingredients, no nutrition numbers and no
// certifications are ever stated for a brand from its name alone. For
// questions this engine cannot answer, it returns null and the caller
// falls back to the normal cloud path (which reports the usual "no key"
// message when no key exists anywhere).
//
// Honesty rules enforced here (same as the system prompt):
// - A named brand/product with no label shared is NEVER given
//   ingredients, nutrition values or a halal/vegetarian/allergen
//   certification. The reply says "I could not verify '<name>'" and
//   asks for the label or typed ingredients.
// - Barcode answers use only the Open Food Facts data passed in, and
//   say so; that data is crowdsourced and can be wrong.
// - Typed-ingredient lists are analysed item by item, only from the
//   words the user typed.

export interface LocalBarcodeProduct {
  code: string;
  name?: string;
  brands?: string;
  categories?: string;
  ingredients?: string;
  allergens?: string;
  nutriscore?: string;
  missing: string[];
}

type Verdict = "everyday" | "sometimes" | "treat";

interface FoodEntry {
  /** Search names, including Roman Urdu and plural forms. */
  names: string[];
  display: string;
  verdict: Verdict;
  /** One or two sentences: what it is and the overall verdict. No numbers. */
  blurb: string;
  pros: string[];
  cons: string[];
  tip: string;
  careful?: string;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "the Zorblox biscuits" -> "Zorblox biscuits" (keeps the user's words). */
function cleanSubject(s: string): string {
  return s
    .trim()
    .replace(/^(the|this|these|a|an)\s+/i, "")
    .replace(/[?.!,;:\s]+$/g, "")
    .trim();
}

const FOODS: FoodEntry[] = [
  // ---- Fruits ----
  { names: ["banana", "bananas", "kela"], display: "Banana", verdict: "everyday",
    blurb: "A banana is a healthy everyday fruit — filling, naturally sweet and easy to carry.",
    pros: ["gives quick energy", "has fibre and potassium", "gentle on the stomach"],
    cons: ["very ripe bananas are sweeter and softer"],
    tip: "One banana makes a good snack, with a handful of nuts or a cup of yogurt.",
    careful: "If you have diabetes, a smaller banana is a better portion — check with your doctor or dietitian." },
  { names: ["apple", "apples", "seb"], display: "Apple", verdict: "everyday",
    blurb: "An apple is a healthy everyday fruit — crunchy, filling and full of fibre.",
    pros: ["fibre keeps you full", "vitamin C", "good for teeth when eaten whole"],
    cons: ["apple juice is not the same — it loses the fibre"],
    tip: "Eat it whole with the skin, washed well." },
  { names: ["orange", "oranges", "santra", "malta"], display: "Orange", verdict: "everyday",
    blurb: "Oranges are a healthy everyday fruit, rich in vitamin C.",
    pros: ["vitamin C", "hydrating and filling"],
    cons: ["juice has much of the sugar without the fibre"],
    tip: "Eat the whole fruit rather than drinking juice." },
  { names: ["mango", "mangoes", "aam"], display: "Mango", verdict: "sometimes",
    blurb: "Mango is a delicious fruit, but it is naturally quite sweet, so a modest portion is best.",
    pros: ["vitamin A and C", "fibre"],
    cons: ["high in natural sugars"],
    tip: "A small bowl of mango as a dessert is plenty.",
    careful: "If you have diabetes, keep the portion small — check with your doctor or dietitian." },
  { names: ["grape", "grapes", "angoor"], display: "Grapes", verdict: "sometimes",
    blurb: "Grapes are a sweet fruit — nice as a snack, but easy to eat a lot of without noticing.",
    pros: ["hydrating", "some antioxidants"],
    cons: ["sugary, so portions creep up"],
    tip: "A small bunch is a good snack." },
  { names: ["watermelon", "tarbooz"], display: "Watermelon", verdict: "everyday",
    blurb: "Watermelon is mostly water, so it is light, hydrating and refreshing.",
    pros: ["very hydrating", "light and refreshing"],
    cons: ["sweet, so large amounts add up"],
    tip: "A couple of slices on a hot day is ideal." },
  { names: ["date", "dates", "khajoor", "khajur"], display: "Dates", verdict: "sometimes",
    blurb: "Dates are naturally sweet and give quick energy — a small number goes a long way.",
    pros: ["fibre, iron and potassium", "good quick energy before activity"],
    cons: ["very sweet and sticky"],
    tip: "Two to three dates with nuts is a satisfying snack.",
    careful: "If you have diabetes, keep the portion small — check with your doctor or dietitian." },
  { names: ["papaya", "papita"], display: "Papaya", verdict: "everyday",
    blurb: "Papaya is a soft, gentle fruit, good for digestion.",
    pros: ["vitamin A and C", "easy to digest"],
    cons: ["ripe papaya is sweet"],
    tip: "A bowl of papaya with a squeeze of lemon is lovely." },
  { names: ["guava", "amrood"], display: "Guava", verdict: "everyday",
    blurb: "Guava is a fibre-rich fruit and a very good everyday choice.",
    pros: ["lots of fibre and vitamin C", "keeps you full"],
    cons: ["hard seeds — chew carefully"],
    tip: "Eat it ripe, with a pinch of salt if you like." },
  { names: ["pomegranate", "anar"], display: "Pomegranate", verdict: "everyday",
    blurb: "Pomegranate is a healthy fruit with a lovely sweet-tart taste.",
    pros: ["antioxidants and vitamin C", "fibre from the seeds"],
    cons: ["takes a little work to eat"],
    tip: "Sprinkle the seeds over yogurt or salad." },
  { names: ["lemon", "lemons", "nimbu", "nimboo"], display: "Lemon", verdict: "everyday",
    blurb: "Lemon adds flavour and vitamin C to food and drinks.",
    pros: ["vitamin C", "makes water and salads brighter"],
    cons: ["acidic — too much can bother teeth and stomach"],
    tip: "A squeeze in water or over food is enough." },
  { names: ["strawberry", "strawberries"], display: "Strawberries", verdict: "everyday",
    blurb: "Strawberries are sweet, light and rich in vitamin C.",
    pros: ["vitamin C", "light and refreshing"],
    cons: ["wash well — they are often sprayed"],
    tip: "A small bowl with yogurt is a nice snack." },
  { names: ["pineapple", "ananas"], display: "Pineapple", verdict: "sometimes",
    blurb: "Pineapple is sweet and refreshing, but quite sugary, so a small portion is best.",
    pros: ["vitamin C", "helps digestion for some people"],
    cons: ["sugary and acidic"],
    tip: "A few slices are enough." },
  { names: ["peach", "peaches", "aaru"], display: "Peach", verdict: "everyday",
    blurb: "Peaches are a gentle, sweet summer fruit.",
    pros: ["vitamin A and C", "hydrating"],
    cons: ["soft and sweet when very ripe"],
    tip: "Eat fresh and ripe." },
  { names: ["plum", "plums", "aloo bukhara"], display: "Plum", verdict: "everyday",
    blurb: "Plums are a sweet-tart fruit, good for digestion.",
    pros: ["fibre", "vitamin C"],
    cons: ["can be tart when unripe"],
    tip: "A few plums make a good snack." },
  { names: ["fig", "figs", "anjeer"], display: "Figs", verdict: "sometimes",
    blurb: "Figs are sweet and full of fibre — fresh or dried, a small portion is best.",
    pros: ["fibre and minerals", "naturally sweet"],
    cons: ["dried figs are very sweet"],
    tip: "One or two dried figs with nuts is plenty." },
  { names: ["kiwi"], display: "Kiwi", verdict: "everyday",
    blurb: "Kiwi is a small fruit packed with vitamin C.",
    pros: ["very high in vitamin C", "fibre"],
    cons: ["tart for some people"],
    tip: "Eat with a spoon, skin removed." },
  { names: ["avocado"], display: "Avocado", verdict: "everyday",
    blurb: "Avocado is rich in healthy fats and very filling.",
    pros: ["healthy fats", "fibre and potassium"],
    cons: ["energy-dense, so portions matter"],
    tip: "Half an avocado on toast or in salad is plenty." },
  // ---- Vegetables ----
  { names: ["potato", "potatoes", "aloo"], display: "Potato", verdict: "sometimes",
    blurb: "Potato is a filling staple — how you cook it matters a lot.",
    pros: ["filling and cheap", "vitamin C and potassium"],
    cons: ["fried potatoes and chips are a different story"],
    tip: "Boiled or baked potato with the skin is the better choice." },
  { names: ["tomato", "tomatoes", "tamatar"], display: "Tomato", verdict: "everyday",
    blurb: "Tomatoes are a healthy everyday vegetable, especially cooked.",
    pros: ["vitamin C", "good for the heart when cooked"],
    cons: ["acidic — can bother some stomachs"],
    tip: "Fresh in salad or cooked into curries." },
  { names: ["onion", "onions", "pyaaz", "piyaz"], display: "Onion", verdict: "everyday",
    blurb: "Onions add flavour and are good for you in everyday amounts.",
    pros: ["adds flavour without heaviness", "some antioxidants"],
    cons: ["raw onion can bother some stomachs"],
    tip: "Use freely in cooking." },
  { names: ["spinach", "palak"], display: "Spinach", verdict: "everyday",
    blurb: "Spinach is one of the healthiest leafy vegetables.",
    pros: ["iron, folate and vitamin K", "very light"],
    cons: ["cooking shrinks it a lot — use a big bunch"],
    tip: "Add to daal, curries or eggs." },
  { names: ["carrot", "carrots", "gajar"], display: "Carrot", verdict: "everyday",
    blurb: "Carrots are sweet, crunchy and great for eyes and skin.",
    pros: ["vitamin A", "fibre"],
    cons: ["sweet when juiced in large amounts"],
    tip: "Raw as a snack or cooked in curries." },
  { names: ["cauliflower", "phool gobhi", "phoolgobhi"], display: "Cauliflower", verdict: "everyday",
    blurb: "Cauliflower is a light, versatile vegetable.",
    pros: ["vitamin C and fibre", "fills the plate without heaviness"],
    cons: ["can cause gas for some people"],
    tip: "Roast it or cook it into curries." },
  { names: ["cabbage", "band gobhi", "bandgobhi"], display: "Cabbage", verdict: "everyday",
    blurb: "Cabbage is a cheap, healthy vegetable, good raw or cooked.",
    pros: ["fibre and vitamin C", "very filling"],
    cons: ["can cause gas"],
    tip: "Shred into salads or cook lightly." },
  { names: ["broccoli"], display: "Broccoli", verdict: "everyday",
    blurb: "Broccoli is a very healthy vegetable.",
    pros: ["vitamin C, K and fibre", "filling"],
    cons: ["best lightly cooked, not overboiled"],
    tip: "Steam or stir-fry briefly." },
  { names: ["pea", "peas", "matar"], display: "Peas", verdict: "everyday",
    blurb: "Peas are sweet, filling and a good source of plant protein and fibre.",
    pros: ["fibre and protein", "vitamin C"],
    cons: ["starchy, so portions matter with rice"],
    tip: "Add to rice, curries or salads." },
  { names: ["okra", "bhindi"], display: "Okra", verdict: "everyday",
    blurb: "Okra (bhindi) is a healthy vegetable, rich in fibre.",
    pros: ["fibre", "vitamin C"],
    cons: ["goes slimy if overcooked"],
    tip: "Cook on high heat with a little lemon." },
  { names: ["eggplant", "baingan", "brinjal"], display: "Eggplant", verdict: "everyday",
    blurb: "Eggplant (baingan) is a light vegetable that soaks up flavours.",
    pros: ["light", "fibre"],
    cons: ["soaks up a lot of oil when fried"],
    tip: "Roast it or cook it with little oil." },
  { names: ["cucumber", "kheera"], display: "Cucumber", verdict: "everyday",
    blurb: "Cucumber is mostly water — light, cooling and hydrating.",
    pros: ["hydrating", "very light"],
    cons: ["not very filling on its own"],
    tip: "Great in salads and raita." },
  { names: ["bell pepper", "capsicum", "shimla mirch"], display: "Capsicum", verdict: "everyday",
    blurb: "Capsicum (shimla mirch) is a colourful, vitamin C-rich vegetable.",
    pros: ["very high in vitamin C", "adds crunch"],
    cons: ["raw capsicum can be strong for some"],
    tip: "Add to stir-fries, salads or curries." },
  { names: ["garlic", "lehsun", "lehsan"], display: "Garlic", verdict: "everyday",
    blurb: "Garlic adds flavour and is good for you in cooking amounts.",
    pros: ["adds flavour", "some heart-friendly compounds"],
    cons: ["strong raw — cook it in"],
    tip: "Use a few cloves in cooking." },
  { names: ["ginger", "adrak"], display: "Ginger", verdict: "everyday",
    blurb: "Ginger is a warming spice, good for digestion and nausea.",
    pros: ["helps digestion", "warming"],
    cons: ["too much can bother the stomach"],
    tip: "A little fresh ginger in tea or cooking." },
  { names: ["sweet potato", "sweet potatoes", "shakarkandi"], display: "Sweet potato", verdict: "everyday",
    blurb: "Sweet potato is a filling, fibre-rich root vegetable.",
    pros: ["fibre and vitamin A", "keeps you full"],
    cons: ["sweet and starchy"],
    tip: "Baked or boiled, with the skin." },
  { names: ["beetroot", "beet", "chukandar"], display: "Beetroot", verdict: "everyday",
    blurb: "Beetroot is a sweet root vegetable, good for blood flow.",
    pros: ["folate and fibre", "natural sweetness"],
    cons: ["can colour urine red — harmless"],
    tip: "Roasted or in salads." },
  { names: ["bitter gourd", "karela"], display: "Bitter gourd", verdict: "everyday",
    blurb: "Bitter gourd (karela) is very healthy, though bitter — it is not a diabetes cure on its own.",
    pros: ["low in heaviness, rich in nutrients", "fibre"],
    cons: ["very bitter"],
    tip: "Cook with onion, tomato and spices to soften the bitterness.",
    careful: "It does not replace diabetes medicine — talk to your doctor." },
  { names: ["bottle gourd", "lauki"], display: "Bottle gourd", verdict: "everyday",
    blurb: "Bottle gourd (lauki) is a light, gentle vegetable, easy to digest.",
    pros: ["very light and hydrating", "easy on the stomach"],
    cons: ["mild — needs spices for flavour"],
    tip: "Cook into a light curry with daal." },
  { names: ["turnip", "shaljam"], display: "Turnip", verdict: "everyday",
    blurb: "Turnip (shaljam) is a light, earthy root vegetable.",
    pros: ["fibre and vitamin C", "light"],
    cons: ["strong taste for some"],
    tip: "Cook into curries or soups." },
  { names: ["radish", "mooli"], display: "Radish", verdict: "everyday",
    blurb: "Radish (mooli) is a crunchy, light vegetable, good raw in salads.",
    pros: ["fibre", "very light"],
    cons: ["sharp taste"],
    tip: "Slice thinly into salad." },
];

FOODS.push(
  // ---- Grains and staples ----
  { names: ["roti", "chapati", "chapatti"], display: "Roti", verdict: "everyday",
    blurb: "Whole wheat roti is a healthy everyday staple.",
    pros: ["fibre from whole wheat", "filling"],
    cons: ["white flour roti has less fibre"],
    tip: "Whole wheat roti with vegetables and daal is a balanced meal." },
  { names: ["naan"], display: "Naan", verdict: "sometimes",
    blurb: "Naan is soft and tasty, but usually made with white flour and often butter, so it is richer than roti.",
    pros: ["filling and satisfying"],
    cons: ["refined flour, often with butter"],
    tip: "Enjoy naan as a treat with curry, not every day." },
  { names: ["white rice", "basmati"], display: "White rice", verdict: "sometimes",
    blurb: "White rice is a filling staple, but it is low in fibre.",
    pros: ["easy to digest", "pairs with everything"],
    cons: ["low fibre, can raise blood sugar quickly"],
    tip: "A modest portion with daal, vegetables and salad.",
    careful: "If you have diabetes, keep the portion modest — check with your doctor or dietitian." },
  { names: ["brown rice"], display: "Brown rice", verdict: "everyday",
    blurb: "Brown rice is rice with the fibre kept — more filling than white rice.",
    pros: ["fibre", "keeps you full longer"],
    cons: ["takes longer to cook"],
    tip: "Cook a big pot and use it through the week." },
  { names: ["rice", "chawal"], display: "Rice", verdict: "sometimes",
    blurb: "Rice is a filling staple — the type and the portion matter most.",
    pros: ["easy to digest", "pairs with everything"],
    cons: ["white rice is low in fibre"],
    tip: "A modest portion with daal, vegetables and salad; brown rice is the better everyday choice.",
    careful: "If you have diabetes, keep the portion modest — check with your doctor or dietitian." },
  { names: ["white bread"], display: "White bread", verdict: "sometimes",
    blurb: "White bread is soft and filling but low in fibre.",
    pros: ["filling and cheap"],
    cons: ["refined flour"],
    tip: "Choose whole wheat bread when you can." },
  { names: ["whole wheat bread", "brown bread", "wholemeal bread"], display: "Whole wheat bread", verdict: "everyday",
    blurb: "Whole wheat bread is a better everyday choice — it has fibre that keeps you full.",
    pros: ["fibre", "keeps you full"],
    cons: ["denser than white bread"],
    tip: "Toast it and add egg, peanut butter or vegetables." },
  { names: ["bread"], display: "Bread", verdict: "sometimes",
    blurb: "Bread is a filling staple — whole wheat is the better everyday choice.",
    pros: ["filling and cheap"],
    cons: ["white bread is low in fibre"],
    tip: "Choose whole wheat bread when you can." },
  { names: ["oats", "oatmeal", "dalia"], display: "Oats", verdict: "everyday",
    blurb: "Oats are a very healthy breakfast — full of fibre that keeps you full.",
    pros: ["soluble fibre", "keeps you full for hours"],
    cons: ["instant flavoured oats often have added sugar"],
    tip: "Plain oats with milk, fruit and nuts." },
  { names: ["pasta", "macaroni", "spaghetti"], display: "Pasta", verdict: "sometimes",
    blurb: "Pasta is a filling staple — the sauce and portion matter most.",
    pros: ["filling and cheap"],
    cons: ["refined flour, easy to overeat"],
    tip: "A modest portion with vegetables and a light sauce." },
  { names: ["noodles", "instant noodles", "maggi"], display: "Noodles", verdict: "sometimes",
    blurb: "Instant noodles are quick and cheap, but the block is mostly refined flour and the flavour packet is mostly salt and oil. On their own they fill you up without giving you much protein, fibre or vitamins — more of a snack than a meal.",
    pros: ["ready in minutes and very cheap", "filling for the price", "easy to improve with vegetables and an egg"],
    cons: ["very salty — the flavour packet alone has most of the salt", "low in fibre and protein", "fried in oil before drying"],
    tip: "Use only half the flavour packet and add vegetables and a boiled egg to turn it into a real meal. Check salt per 100 g on the label. A lighter everyday swap is daal with rice or a simple egg sandwich." },
  { names: ["corn", "makai", "bhutta"], display: "Corn", verdict: "everyday",
    blurb: "Corn is a sweet, filling grain with fibre.",
    pros: ["fibre", "filling"],
    cons: ["sweet — portions matter"],
    tip: "Boiled or roasted corn on the cob." },
  { names: ["barley", "jau"], display: "Barley", verdict: "everyday",
    blurb: "Barley is a hearty, fibre-rich grain.",
    pros: ["very high in fibre", "keeps you full"],
    cons: ["takes time to cook"],
    tip: "Add to soups or cook like rice." },
  // ---- Dairy ----
  { names: ["milk", "doodh"], display: "Milk", verdict: "everyday",
    blurb: "Milk is a good source of calcium and protein.",
    pros: ["calcium and protein", "versatile"],
    cons: ["full-fat milk is richer"],
    tip: "A glass of milk with breakfast is a good habit.",
    careful: "If you are lactose intolerant, try lactose-free milk or yogurt." },
  { names: ["yogurt", "yoghurt", "curd", "dahi"], display: "Yogurt", verdict: "everyday",
    blurb: "Yogurt (dahi) is a healthy everyday food — protein, calcium and good for digestion.",
    pros: ["protein and calcium", "good for digestion"],
    cons: ["sweetened yogurt has added sugar"],
    tip: "Plain yogurt with fruit, or as raita." },
  { names: ["cheese"], display: "Cheese", verdict: "sometimes",
    blurb: "Cheese is tasty and rich in calcium, but it is also salty and fatty, so small portions are best.",
    pros: ["calcium and protein"],
    cons: ["salty and energy-dense"],
    tip: "A small piece with bread or salad." },
  { names: ["butter", "makhan"], display: "Butter", verdict: "treat",
    blurb: "Butter is mostly saturated fat — a little for flavour is fine, but it is not an everyday health food.",
    pros: ["flavour"],
    cons: ["high in saturated fat"],
    tip: "Use a thin spread, or olive oil for cooking." },
  { names: ["ghee"], display: "Ghee", verdict: "treat",
    blurb: "Ghee is pure fat, mostly saturated — use it for flavour in small amounts, not as your main cooking fat.",
    pros: ["flavour, high smoke point"],
    cons: ["very high in saturated fat"],
    tip: "A spoonful for tadka is enough." },
  { names: ["lassi"], display: "Lassi", verdict: "sometimes",
    blurb: "Lassi is refreshing, but sweet lassi has a lot of sugar.",
    pros: ["yogurt base gives protein and calcium"],
    cons: ["sweet lassi is sugary"],
    tip: "Salted lassi or plain lassi is the lighter choice." },
  { names: ["paneer"], display: "Paneer", verdict: "everyday",
    blurb: "Paneer is a good vegetarian protein, rich in calcium.",
    pros: ["protein and calcium", "filling"],
    cons: ["full-fat paneer is rich"],
    tip: "Cook with spinach or peas, not too much oil." },
  // ---- Protein ----
  { names: ["egg", "eggs", "anda", "ande"], display: "Egg", verdict: "everyday",
    blurb: "Eggs are one of the best everyday proteins — complete protein, filling and cheap.",
    pros: ["complete protein", "vitamins"],
    cons: ["yolk has cholesterol — most people can eat an egg a day"],
    tip: "Boiled, scrambled or in an omelette with vegetables." },
  { names: ["chicken", "murghi", "chicken breast"], display: "Chicken", verdict: "everyday",
    blurb: "Chicken is a lean, healthy protein, especially without the skin.",
    pros: ["lean protein", "versatile"],
    cons: ["fried chicken and skin add a lot of fat"],
    tip: "Grilled, roasted or in a curry with little oil." },
  { names: ["beef", "gaay ka gosht"], display: "Beef", verdict: "sometimes",
    blurb: "Beef is rich in iron and protein, but it is also high in saturated fat, so modest portions are best.",
    pros: ["iron and protein"],
    cons: ["saturated fat"],
    tip: "Lean cuts, grilled, with plenty of vegetables.",
    careful: "With high cholesterol or heart concerns, keep portions small — check with your doctor." },
  { names: ["mutton", "bakra gosht", "goat meat"], display: "Mutton", verdict: "sometimes",
    blurb: "Mutton is rich and flavourful, but fatty — an occasional food, not an everyday one.",
    pros: ["iron and protein"],
    cons: ["high in saturated fat"],
    tip: "Small portions, with daal and salad." },
  { names: ["fish", "machli", "machhli"], display: "Fish", verdict: "everyday",
    blurb: "Fish is a healthy protein, and oily fish gives healthy fats.",
    pros: ["lean protein", "healthy fats in oily fish"],
    cons: ["fried fish adds fat"],
    tip: "Grilled or baked fish once or twice a week." },
  { names: ["prawn", "prawns", "shrimp", "jhinga"], display: "Prawns", verdict: "sometimes",
    blurb: "Prawns are a lean protein, but they are high in cholesterol, so enjoy them in modest amounts.",
    pros: ["lean protein"],
    cons: ["cholesterol"],
    tip: "Grilled prawns with salad." },
  { names: ["lentil", "lentils", "daal", "dal", "masoor", "moong", "urad", "arhar", "toor", "chana daal"], display: "Daal", verdict: "everyday",
    blurb: "Daal (lentils) is one of the healthiest foods — full of fibre and plant protein, and very cheap.",
    pros: ["fibre and protein", "iron and folate"],
    cons: ["can cause gas — soak and cook well"],
    tip: "Daal with roti and rice is a complete, balanced meal." },
  { names: ["chickpea", "chickpeas", "chana", "kabuli chana"], display: "Chickpeas", verdict: "everyday",
    blurb: "Chickpeas (chana) are filling, high in fibre and protein.",
    pros: ["fibre and protein", "keeps you full"],
    cons: ["can cause gas"],
    tip: "Chana chaat, hummus, or in curries." },
  { names: ["kidney bean", "kidney beans", "rajma", "lal lobia"], display: "Kidney beans", verdict: "everyday",
    blurb: "Kidney beans (rajma) are a hearty, healthy bean.",
    pros: ["fibre and protein", "iron"],
    cons: ["must be cooked well — never eat raw beans"],
    tip: "Rajma with rice is a classic." },
  { names: ["soy", "soya", "tofu"], display: "Soy and tofu", verdict: "everyday",
    blurb: "Soy and tofu are healthy plant proteins.",
    pros: ["complete plant protein", "low fat"],
    cons: ["plain tofu is bland — it needs flavour"],
    tip: "Stir-fry tofu with vegetables and soy sauce." },
  { names: ["peanut", "peanuts", "moongphali"], display: "Peanuts", verdict: "sometimes",
    blurb: "Peanuts are filling and rich in healthy fats and protein, but they are energy-dense.",
    pros: ["protein and healthy fats", "filling"],
    cons: ["easy to overeat", "a common allergen"],
    tip: "A small handful is a good snack.",
    careful: "Peanuts are a common allergen — never give them to someone with a peanut allergy." },
  { names: ["almond", "almonds", "badam"], display: "Almonds", verdict: "everyday",
    blurb: "Almonds are a healthy snack — healthy fats, fibre and vitamin E.",
    pros: ["healthy fats", "fibre"],
    cons: ["energy-dense"],
    tip: "A small handful, soaked overnight if you like." },
  { names: ["walnut", "walnuts", "akhrot"], display: "Walnuts", verdict: "everyday",
    blurb: "Walnuts are a healthy snack, rich in healthy fats.",
    pros: ["healthy fats", "fibre"],
    cons: ["energy-dense"],
    tip: "A small handful a day." },
  { names: ["cashew", "cashews", "kaju"], display: "Cashews", verdict: "sometimes",
    blurb: "Cashews are creamy and tasty, but they are energy-dense, so a small handful is enough.",
    pros: ["healthy fats", "filling"],
    cons: ["easy to overeat"],
    tip: "A small handful as a snack." },
  // ---- Snacks and drinks ----
  { names: ["biscuit", "biscuits", "cookie", "cookies"], display: "Biscuits", verdict: "treat",
    blurb: "Most packaged biscuits are a treat, not a health food. They are usually made from refined white flour, sugar and palm oil, with very little fibre or protein — so they fill you up for a short while and then leave you hungry again, and the sugar adds up fast if you eat them every day with tea.",
    pros: ["quick and easy with tea", "cheap and easy to find everywhere", "plain kinds are lighter than cream or chocolate ones"],
    cons: ["made from refined flour, sugar and palm oil, with almost no fibre", "easy to eat a whole pack without noticing", "sweet biscuits are hard on teeth and blood sugar"],
    tip: "One or two biscuits with tea is fine for most people. On the label, check sugar and salt per 100 g and pick the lower one, and look for palm oil in the ingredients. A better everyday swap is a piece of fruit or a handful of roasted chana with your tea.",
    careful: "If you have diabetes, sweet biscuits raise blood sugar quickly — ask your doctor how often they fit for you." },
  { names: ["chip", "chips", "crisps"], display: "Potato chips", verdict: "treat",
    blurb: "Potato chips are thin slices of potato fried in oil and covered in salt and flavouring. They taste great, but they are mostly fat and salt with very little of the potato's goodness left — a whole pack disappears fast and still leaves you hungry.",
    pros: ["crunchy and satisfying", "easy to share", "plain salted are usually lighter than cheese or sour-cream flavours"],
    cons: ["fried in a lot of oil", "very salty — a lot of the day's salt can come from one pack", "easy to eat far too much without feeling full"],
    tip: "A small pack once in a while, not every day. On the label, check salt per 100 g and pick the lower one, and choose plain over heavy flavours. A crunchy swap that actually fills you is roasted chana or plain popcorn." },
  { names: ["samosa", "samosas"], display: "Samosa", verdict: "treat",
    blurb: "Samosa is a tasty snack, but it is fried pastry, so it is an occasional food.",
    pros: ["filling, spiced filling"],
    cons: ["fried, refined flour"],
    tip: "Baked samosa is a lighter version." },
  { names: ["pakora", "pakoras"], display: "Pakora", verdict: "treat",
    blurb: "Pakora is a fried snack — tasty with chai, but best as an occasional treat.",
    pros: ["vegetables inside"],
    cons: ["fried, absorbs oil"],
    tip: "Make them small and drain well." },
  { names: ["cake"], display: "Cake", verdict: "treat",
    blurb: "Cake is a celebration food — sugar, flour and fat.",
    pros: ["joyful"],
    cons: ["sugar and fat"],
    tip: "A small slice on special days." },
  { names: ["chocolate"], display: "Chocolate", verdict: "treat",
    blurb: "Most chocolate you buy in a shop is milk chocolate — sugar, milk powder and cocoa butter, with very little cocoa. It is a treat: sweet, creamy and easy to eat too much of. Dark chocolate has more cocoa and less sugar, but it is still a treat, not a health food.",
    pros: ["dark chocolate has some antioxidants", "a little goes a long way for flavour", "a quick treat, no cooking needed"],
    cons: ["mostly sugar and fat", "easy to eat a whole bar in one sitting", "sweet chocolate is hard on teeth"],
    tip: "A few squares of dark chocolate, not a whole bar — and check the sugar per 100 g on the label. If you want something sweet every day, a piece of fruit is the better habit." },
  { names: ["ice cream"], display: "Ice cream", verdict: "treat",
    blurb: "Ice cream is a sweet treat — sugar and cream.",
    pros: ["cooling and joyful"],
    cons: ["sugar and saturated fat"],
    tip: "A small scoop once in a while." },
  { names: ["cola", "coca-cola", "coke", "pepsi", "soft drink", "soda"], display: "Cola and soft drinks", verdict: "treat",
    blurb: "Cola and other soft drinks are mostly sugar water — they give no nutrition, just sugar.",
    pros: ["none for health"],
    cons: ["a lot of sugar, bad for teeth"],
    tip: "Water, nimbu pani or lassi are better everyday drinks. Keep cola for rare occasions.",
    careful: "With diabetes, soft drinks are best avoided — check with your doctor." },
  { names: ["energy drink", "energy drinks"], display: "Energy drinks", verdict: "treat",
    blurb: "Energy drinks are not a health drink. Most are sugar water with a lot of caffeine and flavourings — the energy comes from sugar and caffeine, not from anything your body actually needs, and the crash afterwards often feels worse than before.",
    pros: ["none for health — they feel like energy, but it is sugar and caffeine"],
    cons: ["a lot of sugar in most kinds", "high caffeine can disturb sleep and raise your heart rate", "easy to drink too many when you are tired"],
    tip: "Best avoided; water and a good night's sleep are better energy. If you are reaching for one every day, a short walk and a glass of water do more. Check the sugar and caffeine on the label before you buy one.",
    careful: "Not for children or teenagers — and if you have a heart condition or high blood pressure, ask your doctor before drinking them." },
  { names: ["fruit juice", "juice"], display: "Fruit juice", verdict: "sometimes",
    blurb: "Fruit juice has the vitamins of the fruit, but it loses the fibre — and a glass of juice can hold the sugar of several whole fruits, drunk in seconds. That is why juice is a sometimes drink, not an everyday one.",
    pros: ["vitamins from the fruit", "hydrating"],
    cons: ["sugar without fibre", "easy to drink far more sugar than eating the fruit", "sweet juice is hard on teeth"],
    tip: "A small glass of fresh juice, or eat the fruit instead — you get the fibre and feel full. Check the label: if sugar is added, it is really a soft drink. Water or nimbu pani with little sugar is the better everyday drink." },
  { names: ["tea", "chai", "doodh pati"], display: "Tea", verdict: "everyday",
    blurb: "Plain tea or chai without sugar is a light, comforting drink.",
    pros: ["hydrating", "antioxidants"],
    cons: ["sugary chai adds a lot of sugar"],
    tip: "Chai with little or no sugar, and not too much milk fat.",
    careful: "Too much caffeine can disturb sleep." },
  { names: ["green tea"], display: "Green tea", verdict: "everyday",
    blurb: "Green tea is a light, healthy drink with no sugar.",
    pros: ["antioxidants", "no sugar"],
    cons: ["a little caffeine"],
    tip: "A cup or two a day, without sugar." },
  { names: ["coffee"], display: "Coffee", verdict: "sometimes",
    blurb: "Black coffee is a light drink; sweet milky coffee is a different story.",
    pros: ["alertness", "no calories when black"],
    cons: ["sugar and cream add up"],
    tip: "Black or with a little milk, not too late in the day." },
  { names: ["nimbu pani", "lemonade", "lemon water"], display: "Nimbu pani", verdict: "everyday",
    blurb: "Homemade nimbu pani with a little sugar is a refreshing, light drink.",
    pros: ["hydrating, vitamin C"],
    cons: ["shop versions are often very sweet"],
    tip: "Make it at home with lemon, water, a pinch of salt and little sugar." },
  { names: ["milkshake"], display: "Milkshake", verdict: "sometimes",
    blurb: "A milkshake is a sweet drink — milk is good, but the added sugar and ice cream make it a treat.",
    pros: ["calcium from milk"],
    cons: ["sugar"],
    tip: "Blend milk with banana and no added sugar." },
  // ---- Sweets ----
  { names: ["sugar", "cheeni"], display: "Sugar", verdict: "treat",
    blurb: "Sugar gives sweetness and energy, but no nutrients — use as little as you can.",
    pros: ["sweetness"],
    cons: ["bad for teeth and blood sugar"],
    tip: "Cut sugar in tea gradually." },
  { names: ["honey", "shehed"], display: "Honey", verdict: "sometimes",
    blurb: "Honey is natural, but it is still sugar — a little goes a long way.",
    pros: ["natural sweetness"],
    cons: ["sugary"],
    tip: "A teaspoon in tea is enough.",
    careful: "No honey for babies under one year." },
  { names: ["jaggery", "gur"], display: "Jaggery", verdict: "sometimes",
    blurb: "Jaggery (gur) is less processed than sugar, but it is still sugar.",
    pros: ["some minerals"],
    cons: ["sugary"],
    tip: "Use a little less than you would sugar." },
  { names: ["jam"], display: "Jam", verdict: "treat",
    blurb: "Jam is mostly sugar with some fruit — a thin spread is enough.",
    pros: ["fruity flavour"],
    cons: ["very sweet"],
    tip: "A thin layer on toast." },
  // ---- Pakistani dishes ----
  { names: ["biryani"], display: "Biryani", verdict: "sometimes",
    blurb: "Biryani is a rich, flavourful rice dish — delicious, but oily and salty, so it is an occasional meal.",
    pros: ["protein from meat, spices"],
    cons: ["oil and salt"],
    tip: "Enjoy with raita and salad, and a modest portion." },
  { names: ["karahi"], display: "Karahi", verdict: "sometimes",
    blurb: "Karahi is a tasty curry — how much oil is used makes the difference.",
    pros: ["protein and tomatoes"],
    cons: ["often very oily"],
    tip: "Ask for less oil, and eat with salad." },
  { names: ["kebab", "kebabs", "seekh kebab", "chapli kebab", "shami kebab"], display: "Kebab", verdict: "sometimes",
    blurb: "Kebab is grilled meat — better than fried snacks, but often fatty and salty.",
    pros: ["protein"],
    cons: ["fat and salt"],
    tip: "Grilled kebab with salad and roti." },
  { names: ["nihari"], display: "Nihari", verdict: "treat",
    blurb: "Nihari is a rich, slow-cooked stew — a special-occasion dish.",
    pros: ["flavourful, protein"],
    cons: ["very fatty"],
    tip: "A small portion on special days." },
  { names: ["haleem"], display: "Haleem", verdict: "sometimes",
    blurb: "Haleem is a hearty mix of wheat, barley and meat — filling and nutritious, but rich.",
    pros: ["fibre and protein"],
    cons: ["can be oily and salty"],
    tip: "A bowl with lemon and salad." },
  { names: ["daal chawal", "dal chawal"], display: "Daal chawal", verdict: "everyday",
    blurb: "Daal chawal is a simple, balanced, healthy meal.",
    pros: ["fibre and protein", "filling"],
    cons: ["watch the ghee on top"],
    tip: "Add salad and a spoon of yogurt." },
  { names: ["aloo gosht"], display: "Aloo gosht", verdict: "sometimes",
    blurb: "Aloo gosht is a comforting curry — meat and potato, best in modest portions.",
    pros: ["protein and filling"],
    cons: ["fatty meat, starchy potato"],
    tip: "Lean meat, less oil, plenty of salad." },
  { names: ["palak paneer"], display: "Palak paneer", verdict: "everyday",
    blurb: "Palak paneer is a healthy dish — spinach and paneer together.",
    pros: ["iron, calcium and protein"],
    cons: ["cream makes it richer"],
    tip: "Skip the cream and use little oil." },
  { names: ["paratha", "parathas", "aloo paratha"], display: "Paratha", verdict: "sometimes",
    blurb: "Paratha is a tasty flatbread, but it is fried in oil or ghee, so it is richer than roti.",
    pros: ["filling"],
    cons: ["fried"],
    tip: "A plain paratha with yogurt, or a stuffed one with vegetables." },
  { names: ["halwa"], display: "Halwa", verdict: "treat",
    blurb: "Halwa is a sweet dessert — sugar and ghee.",
    pros: ["comforting"],
    cons: ["very sweet and fatty"],
    tip: "A small serving on special days." },
  { names: ["kheer"], display: "Kheer", verdict: "treat",
    blurb: "Kheer is a sweet rice pudding — milk and rice, but with a lot of sugar.",
    pros: ["calcium from milk"],
    cons: ["sugar"],
    tip: "A small bowl, not every day." },
  { names: ["gulab jamun"], display: "Gulab jamun", verdict: "treat",
    blurb: "Gulab jamun is a very sweet dessert — syrup-soaked, so a small portion is best.",
    pros: ["festive"],
    cons: ["a lot of sugar"],
    tip: "One piece is enough." },
  { names: ["jalebi"], display: "Jalebi", verdict: "treat",
    blurb: "Jalebi is a very sweet, fried dessert — an occasional treat.",
    pros: ["festive"],
    cons: ["sugar and frying"],
    tip: "One or two pieces with tea." },
  { names: ["falooda"], display: "Falooda", verdict: "treat",
    blurb: "Falooda is a rich dessert drink — sweet, creamy and filling.",
    pros: ["cooling and fun"],
    cons: ["sugar and cream"],
    tip: "Share one, or make a lighter version at home." },
  // ---- Oils, salt and spices ----
  { names: ["olive oil"], display: "Olive oil", verdict: "everyday",
    blurb: "Olive oil is a healthy cooking oil — mostly healthy fats.",
    pros: ["healthy fats"],
    cons: ["still fat, so portions matter"],
    tip: "A spoonful for cooking or salad." },
  { names: ["mustard oil", "sarson ka tel"], display: "Mustard oil", verdict: "sometimes",
    blurb: "Mustard oil is a traditional cooking oil with a strong flavour.",
    pros: ["adds flavour"],
    cons: ["strong taste, best in small amounts"],
    tip: "Use a little for tadka." },
  { names: ["sunflower oil"], display: "Sunflower oil", verdict: "sometimes",
    blurb: "Sunflower oil is a neutral cooking oil — fine in small amounts.",
    pros: ["neutral taste"],
    cons: ["still fat"],
    tip: "Measure it — don't pour freely." },
  { names: ["salt", "namak"], display: "Salt", verdict: "treat",
    blurb: "Salt is needed in tiny amounts, but most of us eat too much of it.",
    pros: ["flavour"],
    cons: ["too much salt raises blood pressure"],
    tip: "Taste before adding more, and go easy on salty snacks.",
    careful: "With high blood pressure, keep salt low — check with your doctor." },
  { names: ["turmeric", "haldi"], display: "Turmeric", verdict: "everyday",
    blurb: "Turmeric (haldi) is a healthy spice with anti-inflammatory compounds.",
    pros: ["colour and flavour"],
    cons: ["stains everything"],
    tip: "A pinch in cooking." },
  { names: ["cumin", "zeera", "jeera"], display: "Cumin", verdict: "everyday",
    blurb: "Cumin (zeera) is a warming spice, good for digestion.",
    pros: ["flavour, digestion"],
    cons: ["strong if overused"],
    tip: "Toast the seeds for tadka." },
  { names: ["coriander", "dhania"], display: "Coriander", verdict: "everyday",
    blurb: "Coriander (dhania) is a fresh, healthy herb and spice.",
    pros: ["flavour", "vitamin C in fresh leaves"],
    cons: ["mild on its own"],
    tip: "Fresh leaves on top of curries and salads." },
  // ---- Desi dishes, street food and fast food (v2) ----
  { names: ["pizza"], display: "Pizza", verdict: "treat",
    blurb: "Pizza is usually refined flour, cheese and processed toppings — tasty, but heavy.",
    pros: ["filling and fun"],
    cons: ["refined flour, cheese and salt"],
    tip: "Thin crust, extra vegetables and a small portion make it lighter." },
  { names: ["shawarma"], display: "Shawarma", verdict: "sometimes",
    blurb: "Shawarma is grilled meat in a wrap — better than fried fast food, but sauces and white bread add up.",
    pros: ["grilled meat, salad"],
    cons: ["sauces, white bread, salt"],
    tip: "Ask for extra salad and less sauce." },
  { names: ["fried chicken burger", "zinger", "zinger burger", "chicken burger"], display: "Fried chicken burger", verdict: "treat",
    blurb: "A fried chicken burger is a treat — fried coating, white bun and mayo. This is general guidance for this kind of food, not one brand's recipe.",
    pros: ["filling, chicken gives protein"],
    cons: ["fried coating, white bun, mayo, salt"],
    tip: "Keep it occasional, add salad, and skip extra cheese." },
  { names: ["beef burger", "burger"], display: "Beef burger", verdict: "treat",
    blurb: "A beef burger is a treat — rich meat, white bun and sauces.",
    pros: ["filling"],
    cons: ["fat, white bun, salt"],
    tip: "Small portion, add salad, skip extra cheese and mayo." },
  { names: ["french fries", "fries"], display: "French fries", verdict: "treat",
    blurb: "French fries are fried potatoes — mostly fat and salt.",
    pros: ["filling"],
    cons: ["fried, salty"],
    tip: "Small portion, share them, and skip extra salt." },
  { names: ["hot dog"], display: "Hot dog", verdict: "treat",
    blurb: "A hot dog is processed meat in a white bun — best as an occasional treat.",
    pros: ["quick and filling"],
    cons: ["processed meat, white bun, salt"],
    tip: "Keep it occasional and add salad on the side." },
  { names: ["sandwich"], display: "Sandwich", verdict: "sometimes",
    blurb: "A sandwich is as healthy as its filling — egg, chicken or vegetables make it a good meal.",
    pros: ["quick, filling"],
    cons: ["white bread and mayo when loaded"],
    tip: "Whole wheat bread, egg or chicken, and salad inside." },
  { names: ["paratha roll", "roll paratha"], display: "Paratha roll", verdict: "sometimes",
    blurb: "A paratha roll is filling — the paratha is fried and the filling decides how healthy it is.",
    pros: ["filling"],
    cons: ["fried paratha, sauces"],
    tip: "Chicken or egg filling with salad, less sauce." },
  { names: ["bun kebab", "shami burger"], display: "Bun kebab", verdict: "sometimes",
    blurb: "A bun kebab is a desi favourite — kebab, bun, chutney and onion.",
    pros: ["filling, kebab gives protein"],
    cons: ["fried kebab, white bun, sauces"],
    tip: "Add salad and go easy on the chutney and mayo." },
  { names: ["chicken tikka", "tikka"], display: "Chicken tikka", verdict: "everyday",
    blurb: "Chicken tikka is grilled chicken — lean protein and light.",
    pros: ["lean protein, grilled not fried"],
    cons: ["salty marinade"],
    tip: "Serve with salad and roti." },
  { names: ["tandoori chicken"], display: "Tandoori chicken", verdict: "everyday",
    blurb: "Tandoori chicken is grilled chicken — lean and filling.",
    pros: ["lean protein"],
    cons: ["salt in the marinade"],
    tip: "Eat with salad and roti." },
  { names: ["seekh kebab", "seekh kabab"], display: "Seekh kebab", verdict: "sometimes",
    blurb: "Seekh kebab is grilled minced meat — good protein, but the meat is usually fatty.",
    pros: ["protein"],
    cons: ["fatty meat, salt"],
    tip: "Eat with salad and roti, not extra oil." },
  { names: ["fish fry", "fried fish"], display: "Fish fry", verdict: "sometimes",
    blurb: "Fish fry is tasty but fried — the frying adds fat.",
    pros: ["fish gives protein"],
    cons: ["fried coating, oil"],
    tip: "Grilled fish is lighter — eat fried fish occasionally." },
  { names: ["prawn curry"], display: "Prawn curry", verdict: "sometimes",
    blurb: "Prawn curry is light protein in a spiced gravy — good in modest portions.",
    pros: ["lean protein"],
    cons: ["oil in the gravy"],
    tip: "Keep the oil low and eat with rice or roti." },
  { names: ["chana chaat", "chaat"], display: "Chana chaat", verdict: "everyday",
    blurb: "Chana chaat is a healthy snack — chickpeas with onion, tomato and lemon.",
    pros: ["protein, fibre"],
    cons: ["salty if over-seasoned"],
    tip: "Great for an evening snack." },
  { names: ["dahi bhalla", "dahi bara"], display: "Dahi bhalla", verdict: "sometimes",
    blurb: "Dahi bhalla is lentil dumplings in yogurt — light and cooling, but fried first.",
    pros: ["yogurt, lentils"],
    cons: ["fried dumplings, sweet chutney"],
    tip: "Enjoy in a small portion." },
  { names: ["golgappa", "pani puri", "gol gappa"], display: "Golgappa", verdict: "sometimes",
    blurb: "Golgappa is a fun street snack — crisp shells with spicy water and filling.",
    pros: ["light, fun"],
    cons: ["fried shells, salty spicy water"],
    tip: "A few pieces as a snack, not a full meal." },
  { names: ["bhel puri"], display: "Bhel puri", verdict: "sometimes",
    blurb: "Bhel puri is puffed rice with chutneys — light and tangy.",
    pros: ["light, vegetables"],
    cons: ["salty chutneys"],
    tip: "Fresh and in a small portion." },
  { names: ["momos", "dumplings"], display: "Momos", verdict: "sometimes",
    blurb: "Momos are steamed or fried dumplings — steamed ones are much lighter.",
    pros: ["filling"],
    cons: ["fried versions are oily, white flour wrappers"],
    tip: "Choose steamed momos with a vegetable or chicken filling." },
  { names: ["spring rolls", "spring roll"], display: "Spring rolls", verdict: "sometimes",
    blurb: "Spring rolls are usually fried — tasty, but oily.",
    pros: ["vegetable filling"],
    cons: ["fried wrapper, oil"],
    tip: "Eat a few, not a plateful." },
  { names: ["fried chicken", "broast"], display: "Fried chicken", verdict: "treat",
    blurb: "Fried chicken is a treat — the coating and frying add a lot of fat.",
    pros: ["filling, chicken gives protein"],
    cons: ["fried coating, oil, salt"],
    tip: "Keep it occasional and eat grilled chicken more often." },
  { names: ["chicken nuggets", "nuggets"], display: "Chicken nuggets", verdict: "treat",
    blurb: "Chicken nuggets are processed and fried — a treat, not everyday food.",
    pros: ["quick, filling"],
    cons: ["processed, fried, salty"],
    tip: "Keep them occasional." },
  { names: ["popcorn"], display: "Popcorn", verdict: "sometimes",
    blurb: "Popcorn is light when plain — butter and sugar versions turn it into a treat.",
    pros: ["light, whole grain"],
    cons: ["butter and salt versions are heavy"],
    tip: "Plain or lightly salted popcorn is a good snack." },
  { names: ["namkeen", "nimco", "sev"], display: "Namkeen", verdict: "treat",
    blurb: "Namkeen — sev, nimco, chivda — is fried chickpea flour and lentils with salt and spices. It is crunchy and filling, but it is fried in oil and very salty, and the small pieces make it easy to eat a whole packet without noticing.",
    pros: ["crunchy and filling", "made from lentils and chickpea flour", "goes well with tea"],
    cons: ["fried in a lot of oil", "very salty", "easy to eat a whole packet"],
    tip: "A small handful, not the whole packet — put it in a bowl and close the packet. Check salt per 100 g on the label. A lighter crunchy swap is roasted chana, which is protein and fibre without the frying." },
  { names: ["mathri"], display: "Mathri", verdict: "treat",
    blurb: "Mathri is a crisp fried biscuit made from white flour, ghee or oil, and salt, often with ajwain. It keeps well and tastes great with tea, but it is fried and salty with almost no fibre — a treat, not an everyday food.",
    pros: ["filling and keeps well", "tastes good with tea"],
    cons: ["fried in ghee or oil", "salty and refined flour", "easy to eat several at once"],
    tip: "One or two with tea is enough. A lighter swap for tea time is plain rusk or a piece of fruit." },
  { names: ["rusk", "cake rusk"], display: "Rusk", verdict: "sometimes",
    blurb: "Rusk is a crisp, twice-baked biscuit — lighter than cake and good with tea. Plain rusk is mostly refined flour and a little sugar, while cake rusk and sweet rusk have much more sugar and fat, so the kind you pick matters a lot.",
    pros: ["light and filling", "good with tea", "plain rusk is lighter than cake or cream biscuits"],
    cons: ["sugar in sweet rusks", "refined flour, low fibre", "cake rusk is closer to cake"],
    tip: "Plain rusk with tea, not the sugary kind — and check the sugar on the label. A piece of fruit with your tea is a better everyday habit." },
  { names: ["paya", "trotter", "trotters"], display: "Paya", verdict: "treat",
    blurb: "Paya is a rich, fatty traditional dish — best as an occasional treat.",
    pros: ["rich, warming"],
    cons: ["very fatty"],
    tip: "Small portion, occasionally, with salad." },
  { names: ["chole", "chole masala"], display: "Chole", verdict: "everyday",
    blurb: "Chole is chickpea curry — protein and fibre, a healthy everyday dish.",
    pros: ["protein, fibre"],
    cons: ["oil in the gravy"],
    tip: "Keep the oil low and eat with roti or rice." },
  { names: ["rajma"], display: "Rajma", verdict: "everyday",
    blurb: "Rajma is kidney bean curry — protein and fibre, very filling.",
    pros: ["protein, fibre"],
    cons: ["oil in the gravy"],
    tip: "Great with rice and salad." },
  { names: ["kadhi", "karhi"], display: "Kadhi", verdict: "sometimes",
    blurb: "Kadhi is yogurt-based curry — light and tangy, but the tadka adds oil.",
    pros: ["yogurt, light"],
    cons: ["oil in the tadka"],
    tip: "Eat with rice and keep the oil low." },
  { names: ["mix sabzi", "mixed vegetables"], display: "Mix sabzi", verdict: "everyday",
    blurb: "Mix sabzi is mixed vegetables — a healthy everyday dish.",
    pros: ["fibre, vitamins"],
    cons: ["oil if over-fried"],
    tip: "Light oil, plenty of vegetables." },
  { names: ["sarson ka saag", "mustard greens"], display: "Sarson ka saag", verdict: "everyday",
    blurb: "Sarson ka saag is mustard greens — full of fibre and vitamins.",
    pros: ["fibre, vitamins"],
    cons: ["butter on top adds fat"],
    tip: "Go easy on the butter." },
  { names: ["makki di roti", "corn roti", "makki roti"], display: "Makki di roti", verdict: "sometimes",
    blurb: "Makki di roti is corn flour bread — filling and traditional.",
    pros: ["filling, fibre"],
    cons: ["often eaten with lots of butter"],
    tip: "Eat with saag and a little butter." },
  { names: ["missi roti"], display: "Missi roti", verdict: "sometimes",
    blurb: "Missi roti is gram flour bread — more protein than plain roti.",
    pros: ["protein, fibre"],
    cons: ["oil in the dough"],
    tip: "Good with daal or sabzi." },
  { names: ["aloo paratha", "potato paratha"], display: "Aloo paratha", verdict: "sometimes",
    blurb: "Aloo paratha is a stuffed fried bread — filling, but oily.",
    pros: ["filling"],
    cons: ["fried, potato and butter"],
    tip: "Use little oil and eat with yogurt." },
  { names: ["keema naan"], display: "Keema naan", verdict: "sometimes",
    blurb: "Keema naan is minced meat stuffed bread — rich and filling.",
    pros: ["filling, protein"],
    cons: ["fatty meat, refined flour"],
    tip: "Eat in a modest portion with salad." },
  { names: ["garlic naan"], display: "Garlic naan", verdict: "sometimes",
    blurb: "Garlic naan is white flour bread with butter and garlic.",
    pros: ["tasty, filling"],
    cons: ["refined flour, butter"],
    tip: "One piece with curry is enough." },
  { names: ["sheermal"], display: "Sheermal", verdict: "treat",
    blurb: "Sheermal is a sweet, milky bread — a rich treat.",
    pros: ["soft, sweet"],
    cons: ["sugar, milk, refined flour"],
    tip: "A small piece, occasionally." },
  { names: ["puri", "poori"], display: "Puri", verdict: "treat",
    blurb: "Puri is fried bread — tasty but oily.",
    pros: ["filling"],
    cons: ["fried, refined flour"],
    tip: "Keep it occasional, with sabzi or chole." },
  { names: ["bhatura"], display: "Bhatura", verdict: "treat",
    blurb: "Bhatura is fried leavened bread — a heavy treat.",
    pros: ["soft, filling"],
    cons: ["fried, refined flour"],
    tip: "Occasionally, with chole and salad." },
  { names: ["kulcha", "amritsari kulcha"], display: "Kulcha", verdict: "sometimes",
    blurb: "Kulcha is a soft stuffed bread — filling and tasty.",
    pros: ["filling"],
    cons: ["refined flour, butter"],
    tip: "Eat with chole and salad." },
  { names: ["pav"], display: "Pav", verdict: "sometimes",
    blurb: "Pav is a soft white bread roll — light but refined flour.",
    pros: ["soft, filling"],
    cons: ["refined flour"],
    tip: "Eat with bhaji or kebab and salad." },
  { names: ["custard"], display: "Custard", verdict: "sometimes",
    blurb: "Custard is a sweet milk dessert — light in a small portion.",
    pros: ["milk, light"],
    cons: ["sugar"],
    tip: "Small bowl, with fruit if you like." },
  { names: ["firni"], display: "Firni", verdict: "sometimes",
    blurb: "Firni is a light milk and rice dessert — sweet and cooling.",
    pros: ["milk"],
    cons: ["sugar"],
    tip: "A small bowl after a meal." },
  { names: ["seviyan", "vermicelli"], display: "Seviyan", verdict: "sometimes",
    blurb: "Seviyan is a sweet vermicelli dessert — tasty, but sugary.",
    pros: ["light, festive"],
    cons: ["sugar, milk"],
    tip: "Small portion, occasionally." },
  { names: ["sheer khurma"], display: "Sheer khurma", verdict: "treat",
    blurb: "Sheer khurma is a rich festive dessert — milk, vermicelli, dates and nuts.",
    pros: ["nuts, dates"],
    cons: ["sugar, rich milk"],
    tip: "A small bowl on special days." },
  { names: ["rasgulla", "rasgullay"], display: "Rasgulla", verdict: "treat",
    blurb: "Rasgulla is a sweet syrup dessert — very sugary.",
    pros: ["light cheese base"],
    cons: ["lots of sugar syrup"],
    tip: "One piece, occasionally." },
  { names: ["barfi", "burfi"], display: "Barfi", verdict: "treat",
    blurb: "Barfi is a sweet milk dessert — rich and sugary.",
    pros: ["milk"],
    cons: ["sugar"],
    tip: "A small piece, occasionally." },
  { names: ["ladoo", "laddu"], display: "Ladoo", verdict: "treat",
    blurb: "Ladoo is a sweet festive ball — sugary and rich.",
    pros: ["nuts in some kinds"],
    cons: ["sugar, ghee"],
    tip: "One small piece, occasionally." },
  { names: ["kulfi"], display: "Kulfi", verdict: "treat",
    blurb: "Kulfi is dense frozen milk dessert — rich and sweet.",
    pros: ["milk"],
    cons: ["sugar, cream"],
    tip: "A small portion, occasionally." },
  { names: ["rabri"], display: "Rabri", verdict: "treat",
    blurb: "Rabri is thick sweetened milk — rich and sugary.",
    pros: ["milk"],
    cons: ["sugar, cream"],
    tip: "A few spoonfuls, occasionally." },
  { names: ["sohan halwa"], display: "Sohan halwa", verdict: "treat",
    blurb: "Sohan halwa is a very sweet, rich dessert — a treat.",
    pros: ["nuts"],
    cons: ["sugar, ghee"],
    tip: "A small piece, occasionally." },
  { names: ["gajjar ka halwa", "carrot halwa"], display: "Gajjar ka halwa", verdict: "sometimes",
    blurb: "Gajjar ka halwa is carrot cooked in milk — sweet but made from a vegetable.",
    pros: ["carrot, milk"],
    cons: ["sugar, ghee"],
    tip: "Small portion, less sugar if homemade." },
  { names: ["imarti"], display: "Imarti", verdict: "treat",
    blurb: "Imarti is a fried sweet soaked in syrup — very sugary.",
    pros: ["festive"],
    cons: ["fried, sugar syrup"],
    tip: "One piece, occasionally." },
  { names: ["malpua"], display: "Malpua", verdict: "treat",
    blurb: "Malpua is a fried sweet pancake — rich and sugary.",
    pros: ["festive"],
    cons: ["fried, sugar syrup"],
    tip: "One piece, occasionally." },
  { names: ["rasmalai"], display: "Rasmalai", verdict: "treat",
    blurb: "Rasmalai is soft cheese in sweet milk — light but sugary.",
    pros: ["milk"],
    cons: ["sugar"],
    tip: "One or two pieces, occasionally." },
  { names: ["chargha"], display: "Chargha", verdict: "treat",
    blurb: "Chargha is whole fried chicken — a rich, oily treat.",
    pros: ["chicken, filling"],
    cons: ["fried, oily"],
    tip: "Share it, and eat grilled chicken more often." },
  { names: ["palak gosht"], display: "Palak gosht", verdict: "sometimes",
    blurb: "Palak gosht is spinach and meat curry — greens with protein.",
    pros: ["spinach, protein"],
    cons: ["oil, fatty meat"],
    tip: "Lean meat, little oil, with roti." },
  { names: ["bhindi gosht"], display: "Bhindi gosht", verdict: "sometimes",
    blurb: "Bhindi gosht is okra and meat curry — fibre and protein.",
    pros: ["okra, protein"],
    cons: ["oil"],
    tip: "Keep the oil low." },
  { names: ["dal makhani", "daal makhani"], display: "Dal makhani", verdict: "sometimes",
    blurb: "Dal makhani is creamy black lentils — rich and filling.",
    pros: ["protein, fibre"],
    cons: ["butter and cream"],
    tip: "Enjoy in a small portion with roti." },
  { names: ["dal fry", "daal fry"], display: "Dal fry", verdict: "everyday",
    blurb: "Dal fry is a simple lentil curry — protein and fibre, a healthy everyday dish.",
    pros: ["protein, fibre"],
    cons: ["oil in the tadka"],
    tip: "Light oil, with rice or roti." },
  { names: ["palak daal"], display: "Palak daal", verdict: "everyday",
    blurb: "Palak daal is spinach and lentils — iron, protein and fibre.",
    pros: ["iron, protein, fibre"],
    cons: ["oil in the tadka"],
    tip: "Great with rice." },
  { names: ["shami kebab", "shami kabab"], display: "Shami kebab", verdict: "sometimes",
    blurb: "Shami kebab is a lentil and meat patty — protein, usually shallow-fried.",
    pros: ["protein, lentils"],
    cons: ["fried"],
    tip: "Shallow-fry with little oil." },
  { names: ["chapli kebab"], display: "Chapli kebab", verdict: "sometimes",
    blurb: "Chapli kebab is a spiced minced meat kebab — tasty, but fatty and fried.",
    pros: ["protein"],
    cons: ["fatty meat, fried"],
    tip: "Eat with salad and roti." },
  { names: ["aloo tikki"], display: "Aloo tikki", verdict: "sometimes",
    blurb: "Aloo tikki is a fried potato patty — filling but oily.",
    pros: ["filling"],
    cons: ["fried potato"],
    tip: "Shallow-fry it, and eat with chutney and salad." },
  { names: ["dahi puri"], display: "Dahi puri", verdict: "sometimes",
    blurb: "Dahi puri is crisp shells with yogurt and chutney — light and tangy.",
    pros: ["yogurt"],
    cons: ["fried shells, sweet chutney"],
    tip: "A few pieces as a snack." },
  { names: ["fruit chaat"], display: "Fruit chaat", verdict: "everyday",
    blurb: "Fruit chaat is mixed fruit with lemon and chaat masala — fresh and healthy.",
    pros: ["vitamins, fibre"],
    cons: ["sugar if sweetened"],
    tip: "No added sugar needed." },
  { names: ["raita"], display: "Raita", verdict: "everyday",
    blurb: "Raita is yogurt with cucumber or onion — cooling and light.",
    pros: ["yogurt, vegetables"],
    cons: ["salt if over-seasoned"],
    tip: "Great with biryani and pulao." },
  { names: ["yakhni pulao"], display: "Yakhni pulao", verdict: "sometimes",
    blurb: "Yakhni pulao is fragrant rice cooked in meat stock — tasty and filling.",
    pros: ["filling"],
    cons: ["oil, white rice"],
    tip: "Eat with salad and raita." },
  { names: ["zarda", "sweet rice"], display: "Zarda", verdict: "treat",
    blurb: "Zarda is sweet coloured rice — a festive dessert.",
    pros: ["festive"],
    cons: ["sugar, ghee"],
    tip: "A small portion, occasionally." },
  { names: ["malai boti"], display: "Malai boti", verdict: "sometimes",
    blurb: "Malai boti is creamy grilled chicken — soft and rich.",
    pros: ["chicken, grilled"],
    cons: ["cream"],
    tip: "Eat with salad and roti." },
  { names: ["reshmi kebab"], display: "Reshmi kebab", verdict: "sometimes",
    blurb: "Reshmi kebab is soft creamy chicken kebab — grilled and rich.",
    pros: ["chicken, grilled"],
    cons: ["cream"],
    tip: "Eat with salad." },
  { names: ["thepla"], display: "Thepla", verdict: "everyday",
    blurb: "Thepla is a thin fenugreek flatbread — light and full of fibre.",
    pros: ["fibre, fenugreek"],
    cons: ["oil if fried"],
    tip: "Cook with little oil and eat with yogurt." },
  { names: ["dhokla"], display: "Dhokla", verdict: "everyday",
    blurb: "Dhokla is a steamed lentil snack — light and protein-rich.",
    pros: ["protein, steamed not fried"],
    cons: ["salt"],
    tip: "Great as a light snack." },
  { names: ["uttapam"], display: "Uttapam", verdict: "sometimes",
    blurb: "Uttapam is a thick pancake with vegetables — filling and tasty.",
    pros: ["vegetables"],
    cons: ["oil"],
    tip: "Cook with little oil." },
  { names: ["vada", "medu vada"], display: "Vada", verdict: "sometimes",
    blurb: "Vada is a fried lentil donut — protein, but fried.",
    pros: ["lentils"],
    cons: ["fried"],
    tip: "Eat with sambar, occasionally." },
  { names: ["sambar"], display: "Sambar", verdict: "everyday",
    blurb: "Sambar is lentil and vegetable curry — protein and fibre.",
    pros: ["protein, vegetables"],
    cons: ["salt"],
    tip: "Eat with idli, dosa or rice." },
  { names: ["rasam"], display: "Rasam", verdict: "everyday",
    blurb: "Rasam is a light, tangy lentil soup — good for digestion.",
    pros: ["light, spices"],
    cons: ["salt"],
    tip: "Drink it as soup or with rice." },
  { names: ["curd rice", "dahi rice"], display: "Curd rice", verdict: "everyday",
    blurb: "Curd rice is rice with yogurt — cooling, light and easy to digest.",
    pros: ["yogurt, light"],
    cons: ["white rice"],
    tip: "Add cucumber and a little salt." },
  { names: ["lemon rice"], display: "Lemon rice", verdict: "sometimes",
    blurb: "Lemon rice is tangy rice — light and tasty.",
    pros: ["lemon, peanuts"],
    cons: ["oil, white rice"],
    tip: "Eat with yogurt and salad." },
  { names: ["upma"], display: "Upma", verdict: "sometimes",
    blurb: "Upma is semolina porridge with vegetables — light and filling.",
    pros: ["vegetables"],
    cons: ["oil, salt"],
    tip: "Load it with vegetables." },
  { names: ["poha"], display: "Poha", verdict: "sometimes",
    blurb: "Poha is flattened rice with peanuts — light and filling.",
    pros: ["light, peanuts"],
    cons: ["oil, salt"],
    tip: "Add lemon and vegetables." },
  { names: ["idli"], display: "Idli", verdict: "everyday",
    blurb: "Idli is steamed rice cake — light, soft and easy to digest.",
    pros: ["steamed, light"],
    cons: ["plain on its own"],
    tip: "Eat with sambar." },
  { names: ["dosa"], display: "Dosa", verdict: "sometimes",
    blurb: "Dosa is a crisp rice pancake — light, but cooked with oil.",
    pros: ["light"],
    cons: ["oil"],
    tip: "Eat with sambar and chutney." },
  { names: ["mooli paratha"], display: "Mooli paratha", verdict: "sometimes",
    blurb: "Mooli paratha is radish stuffed bread — filling with fibre.",
    pros: ["fibre"],
    cons: ["fried, butter"],
    tip: "Use little oil and eat with yogurt." },
  { names: ["gobi paratha"], display: "Gobi paratha", verdict: "sometimes",
    blurb: "Gobi paratha is cauliflower stuffed bread — filling and tasty.",
    pros: ["cauliflower"],
    cons: ["fried, butter"],
    tip: "Use little oil and eat with yogurt." },
  { names: ["palak paratha"], display: "Palak paratha", verdict: "sometimes",
    blurb: "Palak paratha is spinach stuffed bread — greens in a bread.",
    pros: ["spinach"],
    cons: ["oil, butter"],
    tip: "Use little oil." },
  { names: ["methi paratha"], display: "Methi paratha", verdict: "sometimes",
    blurb: "Methi paratha is fenugreek stuffed bread — fibre and flavour.",
    pros: ["fenugreek, fibre"],
    cons: ["oil"],
    tip: "Use little oil and eat with yogurt." },
  { names: ["daal paratha"], display: "Daal paratha", verdict: "sometimes",
    blurb: "Daal paratha is lentil stuffed bread — protein and filling.",
    pros: ["protein"],
    cons: ["oil, butter"],
    tip: "Use little oil." },
  { names: ["cheese paratha"], display: "Cheese paratha", verdict: "sometimes",
    blurb: "Cheese paratha is cheese stuffed bread — rich and filling.",
    pros: ["filling"],
    cons: ["cheese, butter"],
    tip: "Eat in a modest portion." },
  // ---- Breakfast (v2) ----
  { names: ["cornflakes"], display: "Cornflakes", verdict: "sometimes",
    blurb: "Cornflakes are a quick breakfast — plain ones are fine, sugary ones are not.",
    pros: ["quick"],
    cons: ["sugar in sweet kinds, low fibre"],
    tip: "Plain cornflakes with milk and a banana." },
  { names: ["muesli", "granola"], display: "Muesli", verdict: "sometimes",
    blurb: "Muesli is oats with nuts and dried fruit — good, but sweetened kinds are sugary.",
    pros: ["oats, nuts"],
    cons: ["sugar in sweetened kinds"],
    tip: "Plain muesli with yogurt and fruit." },
  { names: ["toast"], display: "Toast", verdict: "sometimes",
    blurb: "Toast is as healthy as what you put on it — egg is good, jam is sweet.",
    pros: ["quick"],
    cons: ["white bread when plain"],
    tip: "Whole wheat toast with egg." },
  { names: ["pancakes", "pancake"], display: "Pancakes", verdict: "treat",
    blurb: "Pancakes are a sweet breakfast — flour, sugar and butter.",
    pros: ["filling, fun"],
    cons: ["sugar, refined flour"],
    tip: "Small stack, with fruit instead of syrup." },
  { names: ["waffles", "waffle"], display: "Waffles", verdict: "treat",
    blurb: "Waffles are a sweet breakfast — flour, sugar and butter.",
    pros: ["filling"],
    cons: ["sugar, refined flour"],
    tip: "One waffle with fruit." },
  { names: ["cereal", "breakfast cereal"], display: "Cereal", verdict: "sometimes",
    blurb: "Breakfast cereal varies a lot — plain oats-based kinds are fine, sugary ones are not.",
    pros: ["quick"],
    cons: ["sugar in most sweet kinds"],
    tip: "Check the label for sugar, and add fruit." },
  { names: ["halwa puri"], display: "Halwa puri", verdict: "treat",
    blurb: "Halwa puri is a rich fried breakfast — a weekend treat, not everyday food.",
    pros: ["festive, filling"],
    cons: ["fried, sugary"],
    tip: "Occasionally, in a small portion." },
  { names: ["french toast"], display: "French toast", verdict: "sometimes",
    blurb: "French toast is egg-coated fried bread — filling and tasty.",
    pros: ["egg, filling"],
    cons: ["fried, sugar if sweetened"],
    tip: "Cook with little butter, skip the sugar." },
  // ---- Drinks (v2) ----
  { names: ["orange juice"], display: "Orange juice", verdict: "sometimes",
    blurb: "Orange juice has vitamins, but it loses the fibre of the whole orange.",
    pros: ["vitamin C"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, or eat the orange instead." },
  { names: ["apple juice"], display: "Apple juice", verdict: "sometimes",
    blurb: "Apple juice is sweet — vitamins, but no fibre.",
    pros: ["vitamins"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, or eat the apple." },
  { names: ["mango juice"], display: "Mango juice", verdict: "sometimes",
    blurb: "Mango juice is sweet and tasty — but it is mostly sugar.",
    pros: ["vitamins"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, or eat the mango." },
  { names: ["sugarcane juice", "ganne ka juice", "ganna juice"], display: "Sugarcane juice", verdict: "sometimes",
    blurb: "Sugarcane juice is fresh and natural — but it is still mostly sugar.",
    pros: ["fresh, natural"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, occasionally." },
  { names: ["coconut water", "nariyal pani"], display: "Coconut water", verdict: "everyday",
    blurb: "Coconut water is light and hydrating — a good natural drink.",
    pros: ["hydrating, light"],
    cons: ["mild on its own"],
    tip: "Great after heat or exercise." },
  { names: ["soda water", "sparkling water"], display: "Soda water", verdict: "everyday",
    blurb: "Soda water is fizzy water with no sugar — a good swap for soft drinks.",
    pros: ["no sugar"],
    cons: ["plain taste"],
    tip: "Add lemon for flavour." },
  { names: ["diet cola", "diet coke", "zero cola"], display: "Diet cola", verdict: "sometimes",
    blurb: "Diet cola has no sugar, but it is still a sweetened fizzy drink.",
    pros: ["no sugar"],
    cons: ["sweeteners, no nutrition"],
    tip: "Water or soda water is better." },
  { names: ["iced tea"], display: "Iced tea", verdict: "sometimes",
    blurb: "Iced tea is usually sweetened — plain tea is better.",
    pros: ["refreshing"],
    cons: ["sugar in sweetened kinds"],
    tip: "Unsweetened iced tea with lemon." },
  { names: ["doodh patti", "milk tea"], display: "Doodh patti", verdict: "sometimes",
    blurb: "Doodh patti is milky tea — comforting, but often very sweet.",
    pros: ["milk, warming"],
    cons: ["sugar"],
    tip: "Half the sugar, or no sugar." },
  { names: ["kashmiri chai", "pink tea"], display: "Kashmiri chai", verdict: "sometimes",
    blurb: "Kashmiri chai is pink tea with salt and cream — rich and salty.",
    pros: ["warming"],
    cons: ["salt, cream"],
    tip: "Small cup, occasionally." },
  { names: ["black tea"], display: "Black tea", verdict: "everyday",
    blurb: "Black tea is plain tea — light, no sugar when you skip it.",
    pros: ["light"],
    cons: ["caffeine"],
    tip: "Without sugar is best." },
  { names: ["black coffee"], display: "Black coffee", verdict: "everyday",
    blurb: "Black coffee is plain coffee — light, no sugar when you skip it.",
    pros: ["light, alertness"],
    cons: ["caffeine"],
    tip: "Without sugar and milk is lightest." },
  { names: ["espresso"], display: "Espresso", verdict: "sometimes",
    blurb: "Espresso is strong plain coffee — light, but strong caffeine.",
    pros: ["light"],
    cons: ["strong caffeine"],
    tip: "One small cup is enough." },
  { names: ["cold coffee"], display: "Cold coffee", verdict: "sometimes",
    blurb: "Cold coffee is usually sweetened with milk and sugar — more of a dessert drink.",
    pros: ["refreshing"],
    cons: ["sugar, milk"],
    tip: "Less sugar, or plain iced coffee." },
  { names: ["sports drink", "sports drinks"], display: "Sports drinks", verdict: "sometimes",
    blurb: "Sports drinks are sugary drinks for long exercise — not for everyday thirst.",
    pros: ["salts after heavy sweating"],
    cons: ["sugar"],
    tip: "Water is enough for normal days." },
  { names: ["lemonade"], display: "Lemonade", verdict: "sometimes",
    blurb: "Lemonade is lemon water — refreshing, but often sweetened.",
    pros: ["refreshing"],
    cons: ["sugar"],
    tip: "Little or no sugar, with mint." },
  { names: ["buttermilk", "chaas", "chaach"], display: "Buttermilk", verdict: "everyday",
    blurb: "Buttermilk is thin spiced yogurt drink — light and good for digestion.",
    pros: ["light, digestion"],
    cons: ["salt"],
    tip: "Great with lunch in summer." },
  { names: ["smoothie"], display: "Smoothie", verdict: "sometimes",
    blurb: "A smoothie is as healthy as what goes in it — fruit and yogurt is good, sugar is not.",
    pros: ["fruit, yogurt"],
    cons: ["sugar when sweetened"],
    tip: "Fruit, yogurt and no added sugar." },
  { names: ["hot chocolate"], display: "Hot chocolate", verdict: "treat",
    blurb: "Hot chocolate is a sweet milky drink — a treat.",
    pros: ["warming, comforting"],
    cons: ["sugar, milk"],
    tip: "Small cup, occasionally." },
  { names: ["malt drink", "malted milk", "malt milk drink"], display: "Malt drink", verdict: "sometimes",
    blurb: "Malt drinks are sweetened milk drinks — tasty, but sugary.",
    pros: ["milk"],
    cons: ["sugar"],
    tip: "Small glass, not every day." },
  { names: ["protein shake", "protein powder"], display: "Protein shake", verdict: "sometimes",
    blurb: "A protein shake is useful after training, but real food comes first.",
    pros: ["protein after exercise"],
    cons: ["processed, often sweetened"],
    tip: "Egg, daal or chicken give protein too." },
  { names: ["carrot juice", "gajar ka juice"], display: "Carrot juice", verdict: "sometimes",
    blurb: "Carrot juice has vitamins, but it loses the fibre of the carrot.",
    pros: ["vitamins"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, or eat the carrot." },
  { names: ["pomegranate juice", "anar ka juice"], display: "Pomegranate juice", verdict: "sometimes",
    blurb: "Pomegranate juice is rich and tasty — but sweet, with no fibre.",
    pros: ["vitamins"],
    cons: ["sugar, no fibre"],
    tip: "A small glass, or eat the seeds." },
  { names: ["sharbat"], display: "Sharbat", verdict: "treat",
    blurb: "Sharbat is a very sweet syrup drink — mostly sugar.",
    pros: ["cooling"],
    cons: ["lots of sugar"],
    tip: "Dilute it well and drink rarely." },
  { names: ["sweet lassi", "meethi lassi"], display: "Sweet lassi", verdict: "sometimes",
    blurb: "Sweet lassi is yogurt with sugar — cooling, but sweet.",
    pros: ["yogurt"],
    cons: ["sugar"],
    tip: "Less sugar, or plain lassi." },
  { names: ["salted lassi", "namkeen lassi"], display: "Salted lassi", verdict: "everyday",
    blurb: "Salted lassi is thin yogurt with salt — light and cooling.",
    pros: ["light, digestion"],
    cons: ["salt"],
    tip: "Great with lunch in summer." },
  { names: ["mango lassi"], display: "Mango lassi", verdict: "sometimes",
    blurb: "Mango lassi is mango and yogurt — tasty, but sweet.",
    pros: ["yogurt, mango"],
    cons: ["sugar"],
    tip: "Small glass, less sugar." },
  { names: ["doodh soda"], display: "Doodh soda", verdict: "sometimes",
    blurb: "Doodh soda is milk with soda — fizzy and sweet.",
    pros: ["milk"],
    cons: ["sugar"],
    tip: "Occasionally, in a small glass." },
  // ---- Snacks (v2) ----
  { names: ["crackers", "cracker"], display: "Crackers", verdict: "sometimes",
    blurb: "Crackers are light and crisp, and better than fried snacks — but most are made from refined flour with a lot of salt, and they do not fill you up on their own.",
    pros: ["light and crisp", "better than fried snacks", "good with a topping"],
    cons: ["salt and refined flour", "low fibre", "easy to eat a whole sleeve"],
    tip: "Eat with cheese, hummus or peanut butter so you actually feel full. Check the salt per 100 g on the label. A more filling swap is roasted chana or a small handful of nuts." },
  { names: ["digestive biscuits", "digestive biscuit"], display: "Digestive biscuits", verdict: "sometimes",
    blurb: "Digestive biscuits sound healthy, but the name is mostly marketing. They are still sweet biscuits made from refined flour, sugar and palm oil — a little wholemeal flour does not make them a health food, and they have almost as much sugar as other biscuits.",
    pros: ["a little wholemeal flour", "filling with tea"],
    cons: ["still sweet biscuits, with sugar and palm oil", "the healthy-sounding name is misleading", "easy to eat several at once"],
    tip: "One or two with tea, same as other biscuits. On the label, check the sugar per 100 g — you will see it is close to a normal biscuit. A better everyday swap is a piece of fruit or plain rusk.",
    careful: "If you have diabetes, digestive biscuits still raise blood sugar — ask your doctor how often they fit for you." },
  { names: ["muffins", "muffin"], display: "Muffins", verdict: "treat",
    blurb: "Muffins are sweet baked cakes in a cup — refined flour, sugar, oil and flavouring. A big bakery muffin can be as sweet as a slice of cake, so it is a treat, not a breakfast food.",
    pros: ["filling and tasty"],
    cons: ["sugar and refined flour", "big ones are very sweet", "easy to eat a whole one quickly"],
    tip: "A small muffin, occasionally — share a big one if you can. A better everyday breakfast is oats, eggs, or fruit with yogurt." },
  { names: ["donuts", "doughnuts", "donut"], display: "Donuts", verdict: "treat",
    blurb: "Donuts are fried sweet dough with sugar glaze or filling — a treat. The frying adds oil, the glaze adds sugar, and there is almost no fibre or protein in them.",
    pros: ["fun and filling"],
    cons: ["fried in oil", "a lot of sugar", "no fibre or protein"],
    tip: "One, occasionally, and enjoy it slowly. A better everyday sweet is fruit, or a small piece of cake on a special day." },
  { names: ["croissant"], display: "Croissant", verdict: "treat",
    blurb: "A croissant is layers of white pastry and butter — rich, flaky and filling. It tastes wonderful, but it is mostly butter and refined flour, so it is a treat, not an everyday breakfast.",
    pros: ["rich and filling", "tastes good with coffee"],
    cons: ["a lot of butter", "refined flour, low fibre"],
    tip: "One, occasionally — and skip the extra butter and jam. A lighter everyday breakfast is bread with egg, or oats with fruit." },
  { names: ["nachos"], display: "Nachos", verdict: "treat",
    blurb: "Nachos are fried corn chips with melted cheese and sauce — salty, oily and heavy. They are fun to share, but a plate of them is mostly fat and salt with very little nutrition.",
    pros: ["fun to share", "filling"],
    cons: ["fried chips, cheese and salt", "very heavy for a snack", "easy to eat a whole plate"],
    tip: "Share a portion, occasionally, and add salsa and salad if you can. A lighter crunchy swap is plain popcorn or roasted chana." },
  { names: ["pretzels", "pretzel"], display: "Pretzels", verdict: "sometimes",
    blurb: "Pretzels are salty baked snacks — light and low in fat, but they are mostly refined flour and salt, with almost no fibre or protein to keep you full.",
    pros: ["light and low in fat", "baked, not fried"],
    cons: ["very salty", "refined flour, low fibre"],
    tip: "A small handful, and drink water with them. A more filling swap is roasted chana or a handful of nuts." },
  { names: ["granola bar", "granola bars", "energy bar"], display: "Granola bars", verdict: "sometimes",
    blurb: "Granola bars sound healthy, but many are really candy bars with oats — held together with sugar syrup and honey. Some are better than others, so the label is the only honest guide.",
    pros: ["oats and nuts in the good ones", "easy to carry"],
    cons: ["sugar in most kinds", "some are as sweet as chocolate", "small bar, easy to eat two"],
    tip: "Pick one with little sugar — check the sugar per 100 g and look for nuts and oats first in the ingredients. Or just eat a handful of nuts instead." },
  { names: ["roasted chana", "bhuna chana"], display: "Roasted chana", verdict: "everyday",
    blurb: "Roasted chana is a healthy snack — protein and fibre, very filling.",
    pros: ["protein, fibre"],
    cons: ["salt if over-seasoned"],
    tip: "A small handful as a snack." },
  { names: ["dried apricots", "khushk khubani"], display: "Dried apricots", verdict: "sometimes",
    blurb: "Dried apricots are sweet and chewy — easy to eat too many.",
    pros: ["fibre, iron"],
    cons: ["concentrated sugar"],
    tip: "A few pieces, not a handful." },
  { names: ["raisins", "kishmish"], display: "Raisins", verdict: "sometimes",
    blurb: "Raisins are sweet dried grapes — natural, but sugary and sticky.",
    pros: ["iron, fibre"],
    cons: ["sugar, sticks to teeth"],
    tip: "A small spoonful, with nuts." },
  { names: ["cookies", "cookie"], display: "Cookies", verdict: "treat",
    blurb: "Cookies are sweet baked treats — sugar, butter and flour.",
    pros: ["filling"],
    cons: ["sugar, butter"],
    tip: "One or two, occasionally." },
  { names: ["cream biscuits", "cream biscuit"], display: "Cream biscuits", verdict: "treat",
    blurb: "Cream biscuits are two sweet biscuits with a sugary cream filling in the middle — refined flour, sugar, palm oil and flavouring. They are a treat with tea: sweet, creamy, and easy to eat too many of before you notice.",
    pros: ["sweet and creamy", "a quick treat with tea"],
    cons: ["sugar and cream filling, with palm oil", "very little fibre", "easy to eat a whole pack"],
    tip: "One or two, occasionally. Check the sugar per 100 g on the label and the cream filling in the ingredients. A better everyday swap is a plain biscuit or two, or a piece of fruit with your tea." },
  { names: ["sattu"], display: "Sattu", verdict: "everyday",
    blurb: "Sattu is roasted gram flour — protein and fibre, very filling.",
    pros: ["protein, fibre"],
    cons: ["chalky if too thick"],
    tip: "Mix with water, lemon and salt for a filling drink." },
  // ---- Fruits, vegetables, nuts and seeds (v2) ----
  { names: ["apricot", "khubani"], display: "Apricot", verdict: "everyday",
    blurb: "Apricots are sweet and soft — full of vitamins.",
    pros: ["vitamins, fibre"],
    cons: ["sweet"],
    tip: "Eat fresh when in season." },
  { names: ["pear", "nashpati"], display: "Pear", verdict: "everyday",
    blurb: "Pears are sweet and juicy — full of fibre.",
    pros: ["fibre, vitamins"],
    cons: ["sweet"],
    tip: "Eat fresh, with the skin." },
  { names: ["cherry", "cherries"], display: "Cherry", verdict: "everyday",
    blurb: "Cherries are sweet and fresh — full of vitamins.",
    pros: ["vitamins"],
    cons: ["sweet"],
    tip: "A small handful." },
  { names: ["grapefruit"], display: "Grapefruit", verdict: "everyday",
    blurb: "Grapefruit is tangy and fresh — full of vitamins.",
    pros: ["vitamin C, fibre"],
    cons: ["sour"],
    tip: "Eat fresh.",
    careful: "Grapefruit can clash with some medicines — ask your doctor if you take any." },
  { names: ["lychee", "litchi"], display: "Lychee", verdict: "sometimes",
    blurb: "Lychee is sweet and juicy — tasty, but very sweet.",
    pros: ["vitamins"],
    cons: ["sugar"],
    tip: "A few pieces, not a bowlful." },
  { names: ["custard apple", "shareefa", "sitaphal"], display: "Custard apple", verdict: "sometimes",
    blurb: "Custard apple is creamy and sweet — a rich fruit.",
    pros: ["creamy, filling"],
    cons: ["sweet"],
    tip: "One fruit, occasionally." },
  { names: ["jamun"], display: "Jamun", verdict: "everyday",
    blurb: "Jamun is a tangy desi fruit — low in sugar and good for digestion.",
    pros: ["fibre, low sugar"],
    cons: ["sour"],
    tip: "Eat fresh with a little salt." },
  { names: ["melon", "kharboza"], display: "Melon", verdict: "everyday",
    blurb: "Melon is sweet and watery — hydrating and light.",
    pros: ["hydrating, vitamins"],
    cons: ["sweet"],
    tip: "Eat fresh in summer." },
  { names: ["cantaloupe"], display: "Cantaloupe", verdict: "everyday",
    blurb: "Cantaloupe is sweet and watery — hydrating and light.",
    pros: ["hydrating, vitamins"],
    cons: ["sweet"],
    tip: "Eat fresh." },
  { names: ["coconut", "nariyal"], display: "Coconut", verdict: "sometimes",
    blurb: "Coconut is rich and filling — high in saturated fat.",
    pros: ["filling, flavour"],
    cons: ["high in saturated fat"],
    tip: "A little goes a long way." },
  { names: ["pistachio", "pista"], display: "Pistachio", verdict: "everyday",
    blurb: "Pistachios are tasty nuts — healthy fats and protein.",
    pros: ["healthy fats, protein"],
    cons: ["salty when salted, easy to overeat"],
    tip: "A small handful, unsalted if you can." },
  { names: ["hazelnut"], display: "Hazelnut", verdict: "everyday",
    blurb: "Hazelnuts are tasty nuts — healthy fats and fibre.",
    pros: ["healthy fats"],
    cons: ["easy to overeat"],
    tip: "A small handful." },
  { names: ["sesame seeds", "til"], display: "Sesame seeds", verdict: "everyday",
    blurb: "Sesame seeds are tiny but rich — healthy fats and calcium.",
    pros: ["healthy fats, calcium"],
    cons: ["easy to overeat"],
    tip: "Sprinkle on salads and bread." },
  { names: ["flaxseed", "flaxseeds", "alsi"], display: "Flaxseeds", verdict: "everyday",
    blurb: "Flaxseeds are small seeds with healthy fats and fibre.",
    pros: ["healthy fats, fibre"],
    cons: ["best ground"],
    tip: "A spoonful ground into yogurt or porridge." },
  { names: ["chia seeds", "chia"], display: "Chia seeds", verdict: "everyday",
    blurb: "Chia seeds are tiny seeds with fibre and healthy fats.",
    pros: ["fibre, healthy fats"],
    cons: ["soak them first"],
    tip: "Soak a spoonful in milk or yogurt." },
  { names: ["pumpkin seeds"], display: "Pumpkin seeds", verdict: "everyday",
    blurb: "Pumpkin seeds are crunchy and nutritious — healthy fats and minerals.",
    pros: ["healthy fats, minerals"],
    cons: ["salty when salted"],
    tip: "A small handful, unsalted." },
  { names: ["sunflower seeds"], display: "Sunflower seeds", verdict: "everyday",
    blurb: "Sunflower seeds are crunchy and nutritious — healthy fats.",
    pros: ["healthy fats"],
    cons: ["salty when salted"],
    tip: "A small handful." },
  { names: ["pine nuts", "chilgoza"], display: "Pine nuts", verdict: "everyday",
    blurb: "Pine nuts are rich, buttery nuts — healthy fats.",
    pros: ["healthy fats"],
    cons: ["easy to overeat"],
    tip: "A small handful." },
  { names: ["prunes", "aloo bukhara"], display: "Prunes", verdict: "sometimes",
    blurb: "Prunes are dried plums — sweet and good for digestion.",
    pros: ["fibre"],
    cons: ["sweet, can loosen the stomach"],
    tip: "A few pieces, not a handful.",
    careful: "Too many prunes can upset the stomach." },
  { names: ["mushroom", "mushrooms", "khumbi"], display: "Mushroom", verdict: "everyday",
    blurb: "Mushrooms are light and savoury — low in calories and full of flavour.",
    pros: ["light, flavour"],
    cons: ["mild on their own"],
    tip: "Cook with garlic and serve with roti or rice." },
  { names: ["zucchini"], display: "Zucchini", verdict: "everyday",
    blurb: "Zucchini is a light, mild vegetable — very low in calories.",
    pros: ["light, fibre"],
    cons: ["plain on its own"],
    tip: "Stir-fry with garlic and tomato." },
  { names: ["lettuce", "salad leaves"], display: "Lettuce", verdict: "everyday",
    blurb: "Lettuce is crisp and light — mostly water and fibre.",
    pros: ["light, fibre"],
    cons: ["mild on its own"],
    tip: "Base for salads." },
  { names: ["spring onion", "hari pyaaz"], display: "Spring onion", verdict: "everyday",
    blurb: "Spring onions are fresh and mild — good in salads and cooking.",
    pros: ["flavour, vitamins"],
    cons: ["mild"],
    tip: "Chop over salads and noodles." },
  { names: ["mint", "pudina"], display: "Mint", verdict: "everyday",
    blurb: "Mint is a fresh herb — cooling and good for digestion.",
    pros: ["fresh, digestion"],
    cons: ["mild"],
    tip: "In chutney, raita and tea." },
  { names: ["fenugreek", "methi"], display: "Fenugreek", verdict: "everyday",
    blurb: "Fenugreek is a leafy green — fibre and good for digestion.",
    pros: ["fibre"],
    cons: ["bitter taste"],
    tip: "Cook with potato or daal." },
  { names: ["pumpkin", "kaddu"], display: "Pumpkin", verdict: "everyday",
    blurb: "Pumpkin is a sweet, filling vegetable — full of vitamins.",
    pros: ["vitamins, fibre"],
    cons: ["sweet"],
    tip: "Cook as sabzi with roti." },
  { names: ["ridge gourd", "turai"], display: "Ridge gourd", verdict: "everyday",
    blurb: "Ridge gourd is a light, watery vegetable — easy to digest.",
    pros: ["light, fibre"],
    cons: ["plain"],
    tip: "Cook with tomato and spices." },
  { names: ["green chilli", "green chillies", "hari mirch"], display: "Green chillies", verdict: "everyday",
    blurb: "Green chillies add heat and flavour — and vitamin C.",
    pros: ["flavour, vitamin C"],
    cons: ["too hot for some"],
    tip: "A little goes a long way." },
  { names: ["broad beans"], display: "Broad beans", verdict: "everyday",
    blurb: "Broad beans are protein and fibre — a healthy everyday food.",
    pros: ["protein, fibre"],
    cons: ["take time to cook"],
    tip: "Cook with tomato and spices." },
  { names: ["green beans"], display: "Green beans", verdict: "everyday",
    blurb: "Green beans are light and crunchy — fibre and vitamins.",
    pros: ["fibre, vitamins"],
    cons: ["plain on their own"],
    tip: "Stir-fry with garlic." },
  { names: ["urad daal", "mash daal"], display: "Urad daal", verdict: "everyday",
    blurb: "Urad daal is a protein-rich lentil — very filling.",
    pros: ["protein, fibre"],
    cons: ["heavy if overeaten"],
    tip: "Eat with rice or roti." },
  { names: ["chana daal"], display: "Chana daal", verdict: "everyday",
    blurb: "Chana daal is a split chickpea lentil — protein and fibre.",
    pros: ["protein, fibre"],
    cons: ["takes time to cook"],
    tip: "Soak first, then cook with spices." },
  { names: ["toor daal", "arhar daal"], display: "Toor daal", verdict: "everyday",
    blurb: "Toor daal is an everyday lentil — protein and fibre.",
    pros: ["protein, fibre"],
    cons: ["plain"],
    tip: "Cook with tomato and tadka." },
  { names: ["lobia", "black-eyed beans"], display: "Lobia", verdict: "everyday",
    blurb: "Lobia is a protein-rich bean — filling and healthy.",
    pros: ["protein, fibre"],
    cons: ["takes time to cook"],
    tip: "Soak overnight, then cook." },
  { names: ["green moong", "sabut moong"], display: "Green moong", verdict: "everyday",
    blurb: "Green moong is a light, protein-rich lentil — easy to digest.",
    pros: ["protein, easy to digest"],
    cons: ["plain"],
    tip: "Cook as daal or sprout it." },
  { names: ["sprouts", "ankurit"], display: "Sprouts", verdict: "everyday",
    blurb: "Sprouts are young lentils — fresh, crunchy and nutritious.",
    pros: ["protein, vitamins"],
    cons: ["wash well before eating"],
    tip: "Eat in salads and chaat." },
  { names: ["moth beans", "moth daal"], display: "Moth beans", verdict: "everyday",
    blurb: "Moth beans are a hardy desi lentil — protein and fibre.",
    pros: ["protein, fibre"],
    cons: ["takes time to cook"],
    tip: "Soak overnight, then cook." },
  { names: ["horse gram", "kulthi"], display: "Horse gram", verdict: "everyday",
    blurb: "Horse gram is a strong, protein-rich lentil — very filling.",
    pros: ["protein, fibre"],
    cons: ["heavy"],
    tip: "Eat in small portions." },
  { names: ["black chickpeas", "kala chana"], display: "Black chickpeas", verdict: "everyday",
    blurb: "Black chickpeas are protein and fibre — a healthy desi staple.",
    pros: ["protein, fibre"],
    cons: ["takes time to cook"],
    tip: "Boil and eat as chaat or curry." },
  // ---- Oils and condiments (v2) ----
  { names: ["canola oil"], display: "Canola oil", verdict: "sometimes",
    blurb: "Canola oil is a neutral cooking oil — fine in small amounts.",
    pros: ["neutral taste"],
    cons: ["still fat"],
    tip: "Measure it — don't pour freely." },
  { names: ["vegetable oil"], display: "Vegetable oil", verdict: "sometimes",
    blurb: "Vegetable oil is a neutral cooking oil — fine in small amounts.",
    pros: ["neutral taste"],
    cons: ["still fat"],
    tip: "Measure it." },
  { names: ["coconut oil"], display: "Coconut oil", verdict: "sometimes",
    blurb: "Coconut oil is rich and solid — high in saturated fat.",
    pros: ["flavour"],
    cons: ["high in saturated fat"],
    tip: "Use a little, occasionally." },
  { names: ["sesame oil", "til ka tel"], display: "Sesame oil", verdict: "sometimes",
    blurb: "Sesame oil is a fragrant oil — a little goes a long way.",
    pros: ["flavour"],
    cons: ["still fat"],
    tip: "A few drops for flavour." },
  { names: ["peanut oil"], display: "Peanut oil", verdict: "sometimes",
    blurb: "Peanut oil is a neutral cooking oil — fine in small amounts.",
    pros: ["neutral taste"],
    cons: ["still fat"],
    tip: "Measure it." },
  { names: ["margarine"], display: "Margarine", verdict: "treat",
    blurb: "Margarine is processed fat — butter is usually the better choice.",
    pros: ["spreads easily"],
    cons: ["processed fat"],
    tip: "Use little, or use butter instead." },
  { names: ["mayonnaise", "mayo"], display: "Mayonnaise", verdict: "treat",
    blurb: "Mayonnaise is mostly oil — rich and fatty.",
    pros: ["creamy"],
    cons: ["fat, little nutrition"],
    tip: "A thin spread, or yogurt instead." },
  { names: ["ketchup", "tomato ketchup"], display: "Ketchup", verdict: "treat",
    blurb: "Ketchup is sweet tomato sauce — mostly sugar.",
    pros: ["flavour"],
    cons: ["sugar, salt"],
    tip: "A little, not a puddle." },
  { names: ["soy sauce"], display: "Soy sauce", verdict: "treat",
    blurb: "Soy sauce is very salty — a little adds a lot of flavour.",
    pros: ["flavour"],
    cons: ["very salty"],
    tip: "A few drops." },
  { names: ["pickle", "achaar"], display: "Pickle", verdict: "sometimes",
    blurb: "Pickle adds big flavour — but it is very salty.",
    pros: ["flavour"],
    cons: ["salt, oil"],
    tip: "A spoonful, not a plateful." },
  { names: ["hot sauce"], display: "Hot sauce", verdict: "sometimes",
    blurb: "Hot sauce adds heat with almost no calories — but it is salty.",
    pros: ["flavour, almost no calories"],
    cons: ["salt"],
    tip: "A few drops." },
  // ---- More everyday foods (v2) ----
  { names: ["greek yogurt"], display: "Greek yogurt", verdict: "everyday",
    blurb: "Greek yogurt is thick yogurt — high in protein and very filling.",
    pros: ["protein"],
    cons: ["sour if plain"],
    tip: "Eat with fruit or honey." },
  { names: ["quinoa"], display: "Quinoa", verdict: "everyday",
    blurb: "Quinoa is a grain with complete protein — light and filling.",
    pros: ["protein, fibre"],
    cons: ["plain taste"],
    tip: "Cook like rice and eat with vegetables." },
  { names: ["peanut butter"], display: "Peanut butter", verdict: "sometimes",
    blurb: "Peanut butter is rich in healthy fats — but easy to overeat.",
    pros: ["healthy fats, protein"],
    cons: ["sugar in sweet kinds"],
    tip: "One spoonful, plain kind if you can." },
  { names: ["marmalade"], display: "Marmalade", verdict: "treat",
    blurb: "Marmalade is a sweet orange spread — mostly sugar.",
    pros: ["flavour"],
    cons: ["sugar"],
    tip: "A thin spread." },
  { names: ["brown sugar"], display: "Brown sugar", verdict: "treat",
    blurb: "Brown sugar is still sugar — no healthier than white sugar.",
    pros: ["sweetness"],
    cons: ["sugar"],
    tip: "Use as little as you can." },
  { names: ["sweetener", "artificial sweetener", "stevia"], display: "Sweetener", verdict: "sometimes",
    blurb: "Sweeteners add sweetness without sugar — useful, but best in small amounts.",
    pros: ["no sugar"],
    cons: ["processed taste"],
    tip: "A little goes a long way." },
  { names: ["whole milk"], display: "Whole milk", verdict: "sometimes",
    blurb: "Whole milk is creamy and filling — good, but fatty.",
    pros: ["calcium, protein"],
    cons: ["fat"],
    tip: "A glass a day is fine for most people." },
  { names: ["skimmed milk", "low fat milk"], display: "Skimmed milk", verdict: "everyday",
    blurb: "Skimmed milk is light milk — calcium and protein with less fat.",
    pros: ["calcium, protein, light"],
    cons: ["thinner taste"],
    tip: "Good for tea, cereal and cooking." },
  { names: ["mozzarella"], display: "Mozzarella", verdict: "sometimes",
    blurb: "Mozzarella is a soft, mild cheese — lighter than hard cheese.",
    pros: ["protein, calcium"],
    cons: ["fat, salt"],
    tip: "A little on pizza or salad." },
  { names: ["feta"], display: "Feta", verdict: "sometimes",
    blurb: "Feta is a salty crumbly cheese — strong flavour, so a little goes far.",
    pros: ["protein, flavour"],
    cons: ["salt, fat"],
    tip: "Crumble a little over salad." },
  { names: ["cream cheese"], display: "Cream cheese", verdict: "treat",
    blurb: "Cream cheese is rich and creamy — mostly fat.",
    pros: ["creamy"],
    cons: ["fat"],
    tip: "A thin spread." },
  { names: ["whipped cream", "cream"], display: "Whipped cream", verdict: "treat",
    blurb: "Whipped cream is sweetened cream — a treat topping.",
    pros: ["light texture"],
    cons: ["sugar, fat"],
    tip: "A spoonful, occasionally." },
  { names: ["condensed milk"], display: "Condensed milk", verdict: "treat",
    blurb: "Condensed milk is very sweet thick milk — mostly sugar.",
    pros: ["sweet, rich"],
    cons: ["lots of sugar"],
    tip: "A spoonful in desserts." },
  { names: ["frozen yogurt"], display: "Frozen yogurt", verdict: "sometimes",
    blurb: "Frozen yogurt is lighter than ice cream — but often sugary.",
    pros: ["lighter than ice cream"],
    cons: ["sugar"],
    tip: "Small portion, with fruit." },
  { names: ["sorbet"], display: "Sorbet", verdict: "treat",
    blurb: "Sorbet is frozen fruit and sugar — light but sweet.",
    pros: ["light, fruity"],
    cons: ["sugar"],
    tip: "Small portion." },
  { names: ["dark chocolate"], display: "Dark chocolate", verdict: "sometimes",
    blurb: "Dark chocolate has more cocoa and less sugar than milk chocolate, so a small amount is a reasonable treat. It is still rich in fat and sugar, though — the higher the cocoa, the less sweet it is, and the easier it is to stop at a little.",
    pros: ["less sugar than milk chocolate", "more cocoa means some antioxidants", "a small piece is satisfying"],
    cons: ["still sugary and fatty", "easy to eat too much", "the bitter taste is not for everyone"],
    tip: "One or two small squares after a meal. Check the cocoa percentage on the label — higher cocoa usually means less sugar. A sweet everyday swap is a handful of berries or a piece of fruit." },
  { names: ["milk chocolate"], display: "Milk chocolate", verdict: "treat",
    blurb: "Milk chocolate is the sweetest kind — mostly sugar and milk powder with some cocoa butter. It melts nicely and tastes creamy, but it is a treat, not a food that fills you up or gives you much nutrition.",
    pros: ["creamy and sweet", "a small piece is a quick treat"],
    cons: ["mostly sugar and fat", "easy to eat a whole bar", "hard on teeth if eaten often"],
    tip: "A small piece, occasionally, and enjoy it slowly. Check the sugar per 100 g on the label. A better daily sweet is fruit, or a couple of squares of dark chocolate." },
  { names: ["toffee", "candy"], display: "Toffee", verdict: "treat",
    blurb: "Toffee and candy are almost pure sugar — boiled sugar with flavour and colour. They give a quick sweet hit and nothing else: no fibre, no protein, no vitamins, and they stick to your teeth.",
    pros: ["cheap and easy to carry", "a quick sweet taste"],
    cons: ["almost pure sugar", "sticks to teeth and causes cavities", "gives no nutrition at all"],
    tip: "Occasionally, and brush after. If you want something sweet every day, a piece of fruit or a few raisins with nuts is a much better habit." },
  { names: ["chewing gum"], display: "Chewing gum", verdict: "sometimes",
    blurb: "Chewing gum is mostly harmless — sugar-free is better for teeth.",
    pros: ["fresh breath"],
    cons: ["sugar in sweet kinds"],
    tip: "Sugar-free is the better choice." },
  { names: ["macaroni"], display: "Macaroni", verdict: "sometimes",
    blurb: "Macaroni is pasta — filling, best with vegetables or a light sauce.",
    pros: ["filling"],
    cons: ["refined flour"],
    tip: "Add vegetables and keep cheese light." },
  { names: ["spaghetti"], display: "Spaghetti", verdict: "sometimes",
    blurb: "Spaghetti is pasta — filling, best with tomato or vegetable sauce.",
    pros: ["filling"],
    cons: ["refined flour"],
    tip: "Tomato sauce and salad on the side." },
  { names: ["chowmein", "chow mein"], display: "Chowmein", verdict: "sometimes",
    blurb: "Chowmein is stir-fried noodles — tasty, but oily and salty.",
    pros: ["vegetables"],
    cons: ["oil, salt, soy sauce"],
    tip: "Load it with vegetables." },
  { names: ["manchurian"], display: "Manchurian", verdict: "sometimes",
    blurb: "Manchurian is fried vegetable or chicken balls in sauce — tasty but oily.",
    pros: ["vegetables or chicken"],
    cons: ["fried, salty sauce"],
    tip: "Eat in a modest portion." },
  { names: ["jelly"], display: "Jelly", verdict: "treat",
    blurb: "Jelly is sweet and wobbly — mostly sugar.",
    pros: ["light"],
    cons: ["sugar"],
    tip: "Small portion." },
  { names: ["trifle"], display: "Trifle", verdict: "treat",
    blurb: "Trifle is a layered dessert — cream, custard and cake.",
    pros: ["festive"],
    cons: ["sugar, cream"],
    tip: "Small portion." },
  { names: ["brownie"], display: "Brownie", verdict: "treat",
    blurb: "A brownie is a rich chocolate cake — sweet and filling.",
    pros: ["chocolate"],
    cons: ["sugar, butter"],
    tip: "A small piece, occasionally." },
  { names: ["whole wheat flour", "atta"], display: "Whole wheat flour", verdict: "everyday",
    blurb: "Whole wheat flour (atta) is the base of roti — fibre and filling.",
    pros: ["fibre"],
    cons: ["plain"],
    tip: "Use it for roti and paratha." },
  { names: ["besan", "gram flour"], display: "Besan", verdict: "everyday",
    blurb: "Besan is gram flour — protein and fibre.",
    pros: ["protein, fibre"],
    cons: ["heavy if overeaten"],
    tip: "Use for pakora, cheela and kadhi." },
  // ---- Market, hotel and restaurant food (v2) ----
  { names: ["hotel biryani", "restaurant biryani"], display: "Hotel biryani", verdict: "sometimes",
    blurb: "Hotel biryani is richer than homemade — more oil, salt and masala.",
    pros: ["tasty, filling"],
    cons: ["oil, salt"],
    tip: "Small portion with salad and raita." },
  { names: ["hotel karahi", "restaurant karahi"], display: "Hotel karahi", verdict: "sometimes",
    blurb: "Hotel karahi is richer than homemade — more oil and salt.",
    pros: ["tasty, filling"],
    cons: ["oil, salt"],
    tip: "Small portion with salad and roti." },
  { names: ["bbq", "barbecue"], display: "BBQ", verdict: "sometimes",
    blurb: "BBQ is grilled meat — better than fried, but marinades are salty and naan adds up.",
    pros: ["grilled, protein"],
    cons: ["salty marinade, white naan"],
    tip: "Eat with salad, go easy on the naan." },
  { names: ["continental", "continental food"], display: "Continental food", verdict: "sometimes",
    blurb: "Continental food varies a lot — grilled is good, creamy and fried is heavy.",
    pros: ["variety, salads and grills"],
    cons: ["creamy sauces, fried items"],
    tip: "Pick grilled over fried, and salad over fries." },
  { names: ["fast food"], display: "Fast food", verdict: "treat",
    blurb: "Fast food is quick and tasty — but usually fried, salty and low in nutrients.",
    pros: ["quick, filling"],
    cons: ["fried, salty, low in nutrients"],
    tip: "Keep it occasional, add salad, and drink water with it." },
  { names: ["street food"], display: "Street food", verdict: "sometimes",
    blurb: "Street food is tasty and fresh when made in front of you — but often oily and salty.",
    pros: ["fresh, tasty"],
    cons: ["oil, salt"],
    tip: "Eat it fresh from a clean place, in small portions." },
  { names: ["bakery bread"], display: "Bakery bread", verdict: "sometimes",
    blurb: "Bakery bread is fresh white bread — soft and tasty, but it is refined flour with little fibre. It fills you up for a short while, then leaves you hungry again, especially with just butter and jam.",
    pros: ["fresh and soft", "easy to eat"],
    cons: ["refined flour, low fibre", "does not keep you full for long"],
    tip: "Eat with egg or daal, not just butter and jam — the protein keeps you full. A better everyday swap is whole wheat bread, which has more fibre." },
  { names: ["fresh milk", "shop milk", "doodh wala"], display: "Fresh milk", verdict: "everyday",
    blurb: "Fresh milk from the shop is good — but always boil it first.",
    pros: ["calcium, protein"],
    cons: ["must be boiled"],
    tip: "Boil it well, then cool and store in the fridge.",
    careful: "Never drink shop milk raw — always boil it first." },
  { names: ["packaged juice", "juice box", "tetra pack juice"], display: "Packaged juice", verdict: "sometimes",
    blurb: "Packaged juice in a tetra pack is not the same as fresh juice. It is usually juice from concentrate with added sugar and flavour, and no fibre at all — closer to a sweet drink than to fruit. The front of the pack often shows fresh fruit, so the label on the back is the honest part.",
    pros: ["convenient and easy to carry", "some kinds have vitamins"],
    cons: ["mostly sugar water with flavour", "no fibre at all", "the pack often looks healthier than it is"],
    tip: "Check the label: look for added sugar in the ingredients and compare sugar per 100 g — lower is better, and a pack that says 'fruit drink' is usually sweeter than one that says 'fruit juice'. Eat the fruit instead when you can, or drink water.",
    careful: "If you have diabetes, packaged juice raises blood sugar fast — check with your doctor." },
  { names: ["bakery items", "bakery"], display: "Bakery items", verdict: "sometimes",
    blurb: "Bakery items — cakes, pastries, biscuits and sweet buns — are mostly refined white flour, sugar and butter or oil. They are fresh and tasty, but they are treats: a lot of sugar and fat, and very little fibre or protein to keep you full.",
    pros: ["fresh and tasty", "easy to buy on the way"],
    cons: ["refined flour, sugar and fat in most kinds", "easy to eat too much", "sweet items are hard on teeth and blood sugar"],
    tip: "Plain rusk or bread is lighter than cake, and one small piece is enough for most people. On the label, check sugar per 100 g. A better everyday snack is fruit, roasted chana, or a handful of nuts." },
  { names: ["tandoor naan", "fresh naan"], display: "Tandoor naan", verdict: "sometimes",
    blurb: "Fresh tandoor naan is soft white bread — tasty, but refined flour.",
    pros: ["fresh, soft"],
    cons: ["refined flour, butter"],
    tip: "One naan with curry and salad is enough." },
);

// ---- Matching ----

interface FoodHit {
  entry: FoodEntry;
  start: number;
  length: number;
}

/** Find foods mentioned in the question, in order of appearance.
 *  A longer alias wins over a shorter one at the same spot
 *  ("aloo bukhara" beats "aloo", "brown rice" beats "rice"). */
function findFoods(text: string): FoodHit[] {
  const candidates: FoodHit[] = [];
  for (const entry of FOODS) {
    for (const alias of entry.names) {
      const base = alias.endsWith("s") && alias.length > 3 ? alias.slice(0, -1) : alias;
      const re = new RegExp(`\\b${esc(base)}s?\\b`, "i");
      const m = re.exec(text);
      if (m) candidates.push({ entry, start: m.index, length: m[0].length });
    }
  }
  candidates.sort((a, b) => a.start - b.start || b.length - a.length);
  const accepted: FoodHit[] = [];
  for (const c of candidates) {
    const end = c.start + c.length;
    const overlaps = accepted.some((a) => c.start < a.start + a.length && end > a.start);
    if (overlaps) continue;
    if (accepted.some((a) => a.entry === c.entry)) continue;
    accepted.push(c);
  }
  return accepted;
}

function wholeWord(text: string, word: string): boolean {
  return new RegExp(`\\b${esc(word)}s?\\b`, "i").test(text);
}

// ---- Recipes (generic, no nutrition numbers) ----

interface Recipe {
  title: string;
  needs: string;
  steps: string[];
}

const RECIPES: Record<string, Recipe> = {
  chickpeas: {
    title: "Chana chaat (chickpea salad)",
    needs: "boiled chickpeas, onion, tomato, lemon, green chilli, chaat masala, salt",
    steps: [
      "Mix the boiled chickpeas with chopped onion and tomato.",
      "Squeeze lemon over it and add chopped green chilli.",
      "Sprinkle chaat masala and salt, toss well and serve.",
    ],
  },
  egg: {
    title: "Masala omelette",
    needs: "eggs, onion, tomato, green chilli, coriander, salt, a little oil",
    steps: [
      "Beat the eggs with chopped onion, tomato, chilli and coriander.",
      "Heat a little oil in a pan on medium heat.",
      "Pour the eggs in, cook until set, fold and serve with roti or toast.",
    ],
  },
  chicken: {
    title: "Simple chicken curry",
    needs: "chicken, onion, tomato, ginger, garlic, spices, oil, salt",
    steps: [
      "Fry onion until soft, then add ginger, garlic and spices.",
      "Add tomato and cook until soft, then add the chicken.",
      "Cover and cook on low heat until the chicken is done, then serve with roti or rice.",
    ],
  },
  daal: {
    title: "Simple daal tadka",
    needs: "daal (masoor or moong), onion, tomato, garlic, cumin, turmeric, oil or ghee, salt",
    steps: [
      "Boil the daal with turmeric and salt until soft.",
      "In a small pan, fry garlic, cumin and onion in a little oil or ghee.",
      "Pour the tadka over the daal, add tomato, and serve with rice or roti.",
    ],
  },
  rice: {
    title: "Egg fried rice",
    needs: "cooked rice (cold is best), eggs, onion, peas or carrots, soy sauce, oil",
    steps: [
      "Scramble the eggs in a little oil and set aside.",
      "Fry onion and vegetables, then add the rice and toss.",
      "Add the eggs and a splash of soy sauce, toss well and serve.",
    ],
  },
  potato: {
    title: "Aloo ki sabzi",
    needs: "potatoes, onion, tomato, cumin, turmeric, chilli, oil, salt, coriander",
    steps: [
      "Boil the potatoes, peel and cut them into pieces.",
      "Fry cumin in oil, add onion and tomato, then the spices.",
      "Add the potatoes, toss well, garnish with coriander and serve with roti.",
    ],
  },
  spinach: {
    title: "Palak paneer (light version)",
    needs: "spinach, paneer, onion, tomato, garlic, ginger, spices, a little oil",
    steps: [
      "Blanch the spinach, then blend it into a smooth paste.",
      "Fry onion, garlic, ginger and tomato with spices.",
      "Add the spinach paste and paneer cubes, simmer briefly and serve.",
    ],
  },
  oats: {
    title: "Oats porridge",
    needs: "oats, milk or water, banana or dates, nuts",
    steps: [
      "Boil milk or water and stir in the oats.",
      "Cook on low heat, stirring, until thick and creamy.",
      "Top with sliced banana or chopped dates and nuts.",
    ],
  },
  yogurt: {
    title: "Cucumber raita",
    needs: "yogurt, cucumber, salt, a pinch of cumin",
    steps: [
      "Grate or chop the cucumber finely.",
      "Stir it into the yogurt with salt and cumin.",
      "Chill and serve with rice or curry.",
    ],
  },
  bread: {
    title: "Egg on toast",
    needs: "bread, eggs, butter or oil, salt, pepper",
    steps: [
      "Toast the bread.",
      "Fry or scramble the eggs with a little butter or oil.",
      "Serve the eggs on the toast with salt and pepper.",
    ],
  },
  fish: {
    title: "Grilled fish with lemon",
    needs: "fish fillets, lemon, garlic, salt, pepper, a little oil",
    steps: [
      "Rub the fish with lemon, garlic, salt and pepper.",
      "Grill or pan-fry with a little oil until cooked through.",
      "Serve with salad and rice or roti.",
    ],
  },
  cauliflower: {
    title: "Aloo gobhi",
    needs: "cauliflower, potatoes, onion, tomato, cumin, turmeric, oil, salt",
    steps: [
      "Cut the cauliflower into small florets and the potatoes into pieces.",
      "Fry cumin in oil, add onion and tomato, then the spices.",
      "Add the vegetables, cover and cook on low heat until soft.",
    ],
  },
  okra: {
    title: "Bhindi fry",
    needs: "okra, onion, tomato, cumin, turmeric, chilli, lemon, oil, salt",
    steps: [
      "Cut the okra into pieces and dry it well.",
      "Fry in hot oil with cumin and onion until crisp.",
      "Add tomato and spices, finish with lemon and serve.",
    ],
  },
  "bitter gourd": {
    title: "Karela fry",
    needs: "bitter gourd, onion, salt, turmeric, chilli, oil",
    steps: [
      "Slice the bitter gourd thinly, salt it and leave it for a while, then squeeze out the water.",
      "Fry with onion and spices until crisp.",
      "Serve with roti and daal.",
    ],
  },
  pizza: {
    title: "Homemade pizza (lighter version)",
    needs: "flatbread or naan base, tomato sauce, cheese, vegetables (capsicum, onion, tomato), a little oil",
    steps: [
      "Spread tomato sauce on the base.",
      "Add vegetables and a little cheese.",
      "Bake until the cheese melts, then serve hot.",
    ],
  },
  shawarma: {
    title: "Homemade shawarma wrap",
    needs: "chicken strips, yogurt, garlic, lemon, roti or wrap, salad, cucumber",
    steps: [
      "Marinate the chicken in yogurt, garlic and lemon, then grill it.",
      "Warm the roti and add the chicken with salad.",
      "Roll it up and serve.",
    ],
  },
  popcorn: {
    title: "Stovetop popcorn",
    needs: "popcorn kernels, a little oil, salt",
    steps: [
      "Heat a little oil in a pot with a lid.",
      "Add the kernels, cover, and shake the pot as they pop.",
      "Add a pinch of salt and serve.",
    ],
  },
  "fruit chaat": {
    title: "Fruit chaat",
    needs: "mixed fruit (banana, apple, orange, guava), lemon, chaat masala",
    steps: [
      "Chop all the fruit into pieces.",
      "Squeeze lemon over it.",
      "Sprinkle chaat masala, toss and serve.",
    ],
  },
  "vegetable soup": {
    title: "Simple vegetable soup",
    needs: "mixed vegetables, onion, garlic, salt, pepper, water",
    steps: [
      "Boil the vegetables with onion and garlic until soft.",
      "Blend half of it for a thick soup, or leave it chunky.",
      "Season with salt and pepper and serve hot.",
    ],
  },
  "chicken soup": {
    title: "Simple chicken soup",
    needs: "chicken pieces, onion, garlic, ginger, carrots, salt, pepper",
    steps: [
      "Boil the chicken with onion, garlic and ginger.",
      "Add carrots and simmer until everything is soft.",
      "Season and serve hot — good when you are feeling unwell.",
    ],
  },
  khichdi: {
    title: "Khichdi (rice and daal)",
    needs: "rice, moong daal, turmeric, salt, a little ghee or oil",
    steps: [
      "Wash the rice and daal, then boil with turmeric and salt.",
      "Cook until soft and porridge-like.",
      "Add a small tadka of ghee and cumin, and serve with yogurt.",
    ],
  },
  "vegetable pulao": {
    title: "Vegetable pulao",
    needs: "rice, mixed vegetables, onion, whole spices, oil, salt",
    steps: [
      "Fry onion and whole spices in a little oil.",
      "Add vegetables and rice, then water and salt.",
      "Cover and cook on low heat until the rice is done.",
    ],
  },
  "egg curry": {
    title: "Simple egg curry",
    needs: "boiled eggs, onion, tomato, ginger, garlic, spices, oil",
    steps: [
      "Fry onion, ginger and garlic, then add tomato and spices.",
      "Add the boiled eggs and a little water.",
      "Simmer briefly and serve with roti or rice.",
    ],
  },
  "aloo paratha": {
    title: "Aloo paratha (light version)",
    needs: "whole wheat dough, boiled potatoes, onion, green chilli, coriander, spices, a little oil",
    steps: [
      "Mash the potatoes with onion, chilli, coriander and spices.",
      "Stuff the filling into the dough and roll it out.",
      "Cook on a hot pan with a little oil and serve with yogurt.",
    ],
  },
  "shami kebab": {
    title: "Shami kebab",
    needs: "chana daal, minced meat, onion, spices, egg, a little oil",
    steps: [
      "Boil the daal and meat with spices until soft, then grind into a paste.",
      "Shape into patties and coat lightly with beaten egg.",
      "Shallow-fry with little oil and serve with salad.",
    ],
  },
  kadhi: {
    title: "Kadhi",
    needs: "yogurt, besan, turmeric, salt, garlic, cumin, dried red chilli, oil",
    steps: [
      "Whisk yogurt with besan, turmeric and salt until smooth.",
      "Cook on low heat, stirring, until it thickens.",
      "Fry garlic and cumin in a little oil and pour over the kadhi.",
    ],
  },
  "mix sabzi": {
    title: "Mix sabzi",
    needs: "mixed vegetables, onion, tomato, garlic, cumin, turmeric, oil, salt",
    steps: [
      "Cut all the vegetables into even pieces.",
      "Fry cumin and garlic in a little oil, then add onion and tomato.",
      "Add the vegetables, cover and cook on low heat until soft.",
    ],
  },
  "sarson ka saag": {
    title: "Sarson ka saag",
    needs: "mustard greens, spinach, onion, garlic, ginger, green chilli, salt, a little butter",
    steps: [
      "Boil the greens until soft, then mash them.",
      "Fry onion, garlic, ginger and chilli, then add the greens.",
      "Simmer briefly and serve with makki di roti and a little butter.",
    ],
  },
  "dal makhani": {
    title: "Dal makhani (lighter version)",
    needs: "black urad daal, kidney beans, onion, tomato, garlic, ginger, a little butter, cream, salt",
    steps: [
      "Soak the daal and beans overnight, then boil until soft.",
      "Fry onion, garlic, ginger and tomato, then add the daal.",
      "Simmer on low heat, finish with a little butter and cream, and serve with roti.",
    ],
  },
  "sattu drink": {
    title: "Sattu drink",
    needs: "sattu, cold water, lemon, salt, roasted cumin",
    steps: [
      "Mix the sattu into cold water until smooth.",
      "Add lemon, salt and a pinch of roasted cumin.",
      "Stir well and drink cold.",
    ],
  },
  "sweet lassi": {
    title: "Sweet lassi",
    needs: "yogurt, cold water or milk, a little sugar, ice",
    steps: [
      "Whisk the yogurt with cold water or milk.",
      "Add a little sugar and blend until smooth.",
      "Serve cold with ice.",
    ],
  },
  lemonade: {
    title: "Lemonade",
    needs: "lemons, cold water, a little sugar or honey, mint leaves",
    steps: [
      "Squeeze the lemons into cold water.",
      "Add a little sugar or honey and stir until dissolved.",
      "Add mint leaves and serve cold.",
    ],
  },
  "cold coffee": {
    title: "Cold coffee (light version)",
    needs: "cold milk, instant coffee, a little sugar, ice",
    steps: [
      "Dissolve the coffee in a little hot water.",
      "Blend with cold milk, a little sugar and ice.",
      "Serve cold.",
    ],
  },
  pancakes: {
    title: "Simple pancakes",
    needs: "flour, egg, milk, a little sugar, a pinch of baking powder, a little butter",
    steps: [
      "Whisk the flour, egg, milk, sugar and baking powder into a smooth batter.",
      "Pour small rounds into a hot pan with a little butter.",
      "Flip when bubbles appear, and serve with fruit.",
    ],
  },
  "french toast": {
    title: "French toast",
    needs: "bread, eggs, milk, a pinch of cinnamon, a little butter",
    steps: [
      "Beat the eggs with milk and cinnamon.",
      "Dip the bread in the mixture.",
      "Fry in a little butter until golden on both sides.",
    ],
  },
  smoothie: {
    title: "Banana smoothie",
    needs: "banana, yogurt or milk, a spoonful of oats, ice",
    steps: [
      "Put the banana, yogurt or milk, oats and ice in a blender.",
      "Blend until smooth.",
      "Pour and drink right away.",
    ],
  },
  kachumber: {
    title: "Kachumber salad",
    needs: "cucumber, tomato, onion, lemon, salt, green chilli",
    steps: [
      "Chop the cucumber, tomato and onion finely.",
      "Add lemon, salt and chopped green chilli.",
      "Toss and serve with any meal.",
    ],
  },
  "green chutney": {
    title: "Green chutney",
    needs: "coriander, mint, green chilli, lemon, salt, a little yogurt",
    steps: [
      "Blend the coriander, mint and green chilli with lemon and salt.",
      "Add a spoon of yogurt for a creamy chutney.",
      "Serve with kebab, samosa or sandwiches.",
    ],
  },
};

function recipeFor(entry: FoodEntry): Recipe | null {
  const key = entry.display.toLowerCase();
  if (RECIPES[key]) return RECIPES[key];
  for (const name of entry.names) {
    if (RECIPES[name]) return RECIPES[name];
  }
  return null;
}

function genericRecipe(entry: FoodEntry): Recipe | null {
  const d = entry.display.toLowerCase();
  const vegWords = ["potato", "cauliflower", "cabbage", "carrot", "peas", "okra", "eggplant", "cucumber", "pepper", "beetroot", "turnip", "radish", "gourd", "broccoli", "spinach", "tomato", "onion"];
  if (vegWords.some((w) => d.includes(w))) {
    return {
      title: `Simple ${entry.display} stir-fry`,
      needs: `${entry.display}, onion, tomato, garlic, cumin, turmeric, oil, salt`,
      steps: [
        `Cut the ${entry.display} into even pieces.`,
        "Fry cumin and garlic in a little oil, then add onion and tomato.",
        `Add the ${entry.display}, cover and cook on low heat until soft, then serve with roti or rice.`,
      ],
    };
  }
  if (d.includes("daal") || d.includes("bean") || d.includes("chickpea") || d.includes("lentil")) {
    return {
      title: `Simple ${entry.display} curry`,
      needs: `${entry.display}, onion, tomato, garlic, ginger, cumin, turmeric, oil, salt`,
      steps: [
        `Soak the ${entry.display} if needed, then boil until soft.`,
        "Fry onion, garlic, ginger and tomato with spices.",
        `Add the ${entry.display}, simmer briefly and serve with rice or roti.`,
      ],
    };
  }
  return null;
}

// ---- Answer builders ----

/** Tiny deterministic hash so the same food always gets the same wording,
 *  but different foods read differently — answers feel less templated. */
function hashStr(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000003;
  return h;
}

const OPENERS = ["Short answer: ", "In short: ", "The honest take: ", "Quick answer: "];
const GOOD_LABELS = ["What's good: ", "The good side: ", "Why it's good: "];
const WATCH_LABELS = ["Watch out for: ", "The catch: ", "Be careful about: "];
const TIP_LABELS = ["How to enjoy it: ", "Best way to have it: ", "My suggestion: "];
const CLOSERS = [
  "Do you usually have it with roti or rice?",
  "Want me to compare it with something else?",
  "Do you eat it often?",
  "Want a quick recipe with it?",
  "Shall I tell you the best way to have it?",
];

function foodAnswer(entry: FoodEntry, extra?: string): string {
  const h = hashStr(entry.display);
  const lines = [
    `${OPENERS[h % OPENERS.length]}${entry.blurb}`,
    "",
    `${GOOD_LABELS[h % GOOD_LABELS.length]}${entry.pros.join("; ")}.`,
    `${WATCH_LABELS[h % WATCH_LABELS.length]}${entry.cons.join("; ")}.`,
    `${TIP_LABELS[h % TIP_LABELS.length]}${entry.tip}`,
  ];
  if (entry.careful) lines.push(`Who should be careful: ${entry.careful}`);
  if (extra) lines.push(extra);
  lines.push("", CLOSERS[h % CLOSERS.length]);
  return lines.join("\n");
}

/** Pros and cons, spelled out, for "pros and cons of X" / "faide aur nuksan" questions. */
function prosConsAnswer(entry: FoodEntry): string {
  const lines = [
    `Pros and cons of ${entry.display}:`,
    "",
    "Pros:",
    ...entry.pros.map((p) => `- ${p.charAt(0).toUpperCase()}${p.slice(1)}.`),
    "",
    "Cons:",
    ...entry.cons.map((c) => `- ${c.charAt(0).toUpperCase()}${c.slice(1)}.`),
    "",
    `Best way to have it: ${entry.tip}`,
  ];
  if (entry.careful) lines.push(`Who should be careful: ${entry.careful}`);
  lines.push("", CLOSERS[hashStr(entry.display) % CLOSERS.length]);
  return lines.join("\n");
}

/** "Why?" after an answer — the reasoning behind the verdict, in plain words. */
function whyAnswer(entry: FoodEntry): string {
  const verdictWord = entry.verdict === "everyday" ? "an everyday food" : entry.verdict === "sometimes" ? "a sometimes food" : "a treat";
  const lines = [
    `Good question — here's why ${entry.display.toLowerCase()} counts as ${verdictWord}.`,
    "",
    `The good side: ${entry.pros.join("; ")}.`,
    `The catch: ${entry.cons.join("; ")}.`,
    "",
    entry.careful ? `Who should be careful: ${entry.careful}` : `Best way to have it: ${entry.tip}`,
    "",
    CLOSERS[hashStr(entry.display) % CLOSERS.length],
  ];
  return lines.join("\n");
}

/** Render a recipe as answer lines (used by the cooking path and "yes" follow-ups). */
function recipeLines(recipe: Recipe): string {
  return [
    `${recipe.title}`,
    "",
    `You'll need: ${recipe.needs}.`,
    "",
    ...recipe.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
  ].join("\n");
}

function compareAnswer(a: FoodEntry, b: FoodEntry): string {
  const rank: Record<Verdict, number> = { everyday: 2, sometimes: 1, treat: 0 };
  const better = rank[a.verdict] > rank[b.verdict] ? a : rank[b.verdict] > rank[a.verdict] ? b : null;
  const lines = [
    `Short answer: ${better ? `${better.display} is the better everyday choice of the two.` : `${a.display} and ${b.display} are roughly similar — both are fine in modest amounts.`}`,
    "",
    `${a.display}: ${a.blurb}`,
    `${b.display}: ${b.blurb}`,
    "",
    `How to enjoy them: ${a.tip} ${b.tip}`,
    "",
    "Want me to compare either of them with something else?",
  ];
  return lines.join("\n");
}

const LABEL_GUIDE = `Reading a food label — the quick version:

Per 100 g is the fair comparison. Packets show nutrition per serving and per 100 g — always compare the per 100 g column, because serving sizes differ between brands.

Sugar, salt and fat: lower is usually better. The traffic-light colours on some packs help: green means low, amber means medium, red means high.

Ingredients are listed heaviest first. The first ingredient is the biggest part of the food. If sugar, palm oil or refined flour is first, it is mostly that.

Allergens are in bold. Wheat, milk, egg, peanut, nuts, soy, sesame, fish and mustard must be highlighted in the ingredients list — check there first.

Dates and storage: check the use-by date and how to store it. When in doubt about a date or a smell, throw it out.

Send a clear photo of the label, or type the ingredients, and I will go through them with you.`;

const PLATE_GUIDE = `A balanced plate, in general:

Fill about half the plate with vegetables or salad, about a quarter with protein (daal, chicken, egg, fish or paneer), and about a quarter with grains (roti or rice). Add a spoon of yogurt if you like.

Tell me what you actually ate — for example "rice, chicken curry and salad" — and I will say how it looks.`;

const COOK_TODAY = `Three quick ideas from everyday ingredients:

Chana chaat — boiled chickpeas with onion, tomato, lemon and chaat masala. No cooking needed.

Masala omelette with roti — eggs with onion, tomato and green chilli, folded and served with roti.

Daal with rice and salad — simple daal tadka, rice and a cucumber salad. A complete, balanced meal.

Tell me what you have in the kitchen — for example "chickpeas, eggs and potatoes" — and I will give you a recipe for it.`;

const GREETING = `Hello! I'm FOODLENS, your food-only assistant.

Ask me anything about food — for example: is banana healthy, what can I cook with chickpeas, or how do I read a food label? You can also scan a barcode to check a product, or send a photo of a label.

Right now I am answering from FOODLENS local knowledge, no API key needed. Add a key in Settings for fuller answers.`;

// ---- Typed-ingredient lists ----

const ALLERGEN_MAP: { allergen: string; words: string[] }[] = [
  { allergen: "peanut", words: ["peanut", "peanuts", "groundnut"] },
  { allergen: "tree nuts", words: ["almond", "cashew", "walnut", "pistachio", "hazelnut", "badam", "kaju", "akhrot"] },
  { allergen: "milk", words: ["milk", "butter", "cheese", "cream", "whey", "casein", "ghee", "yogurt", "curd", "dahi"] },
  { allergen: "egg", words: ["egg", "eggs", "albumen", "anda"] },
  { allergen: "wheat / gluten", words: ["wheat", "flour", "maida", "barley", "rye", "gluten", "semolina", "sooji"] },
  { allergen: "soy", words: ["soy", "soya", "tofu"] },
  { allergen: "sesame", words: ["sesame", "til"] },
  { allergen: "fish", words: ["fish", "machli"] },
  { allergen: "shellfish", words: ["prawn", "shrimp", "crab", "lobster", "jhinga"] },
  { allergen: "mustard", words: ["mustard", "rai"] },
  { allergen: "sulphites", words: ["sulphite", "sulphites", "e220", "e221", "e222", "e223", "e224", "e225", "e226", "e227", "e228"] },
];

const NON_HALAL_WORDS = ["pork", "ham", "bacon", "lard", "alcohol", "wine", "beer", "rum", "vodka", "whisky", "brandy", "suur", "suar"];
const AMBIGUOUS_HALAL_WORDS = ["gelatin", "gelatine", "e441", "e120", "carmine", "vanilla extract", "rennet", "whey"];
const MEAT_WORDS = ["chicken", "beef", "mutton", "pork", "ham", "bacon", "fish", "meat", "gelatin", "gelatine", "rennet", "gosht", "murghi", "machli"];
const ANIMAL_WORDS = [...MEAT_WORDS, "milk", "egg", "eggs", "honey", "butter", "cheese", "ghee", "yogurt", "curd", "dahi", "whey", "doodh", "anda"];

function itemHas(item: string, words: string[]): boolean {
  return words.some((w) => wholeWord(item, w));
}

/** Split a comma/and list out of the user's message. Returns null when there is no list. */
function extractList(original: string): string[] | null {
  const parts = original.split(",");
  if (parts.length < 2) return null;
  const items: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim();
    if (i === 0) {
      p = p.replace(/^.*?\bingredients?\b[:\s]*/i, "").replace(/^.*?\bcontain(s|ing)?\b\s*/i, "");
      // A leading question fragment ("Is this biscuit healthy") is not an ingredient.
      if (/^(is|are|does|do|can|should|what|which|how)\b/i.test(p)) p = "";
    }
    if (i === parts.length - 1) p = p.split(/[?.!]/)[0];
    p = p.replace(/^(the|a|an)\s+/i, "").trim();
    for (const ap of p.split(/\s+and\s+/i)) {
      const clean = ap.replace(/^(the|a|an)\s+/i, "").trim();
      if (clean) items.push(clean);
    }
  }
  if (items.length < 2) return null;
  if (items.some((it) => it.split(/\s+/).length > 5)) return null;
  return items;
}

function analyseTypedList(original: string, norm: string): string | null {
  const items = extractList(original);
  if (!items) return null;
  const isAllergenQ = /\ballerg/.test(norm) || /contain/.test(norm);
  const isHalalQ = /\bhalal\b/.test(norm);
  const isVegQ = /\bvegetarian\b/.test(norm) || /\bvegan\b/.test(norm);
  if (!isAllergenQ && !isHalalQ && !isVegQ) return null;
  const lines: string[] = [
    "Here is what I can say from the ingredients you typed — only from your list, not a label check:",
    "",
  ];
  if (isAllergenQ) {
    const target = ALLERGEN_MAP.find((g) => g.words.some((w) => wholeWord(norm, w) && !/\ballerg/.test(w)));
    for (const item of items) {
      const groups = ALLERGEN_MAP.filter((g) => itemHas(item, g.words)).map((g) => g.allergen);
      if (target) {
        const hit = groups.includes(target.allergen);
        lines.push(`- ${item} — ${hit ? `contains ${target.allergen}.` : `not related to ${target.allergen}.`}`);
      } else {
        lines.push(`- ${item} — ${groups.length ? `contains ${groups.join(", ")}.` : "no major allergen in this item."}`);
      }
    }
    lines.push("", "This only covers what you typed — always check the real label too, because recipes change and \"may contain\" warnings matter.");
  } else if (isHalalQ) {
    for (const item of items) {
      if (itemHas(item, NON_HALAL_WORDS)) lines.push(`- ${item} — not halal.`);
      else if (itemHas(item, AMBIGUOUS_HALAL_WORDS)) lines.push(`- ${item} — I can't tell from the name alone; check the label for the source or a halal mark.`);
      else lines.push(`- ${item} — no obvious problem in this list.`);
    }
    lines.push("", "Halal also depends on certification — check the label for a halal mark.");
  } else {
    const isVegan = /\bvegan\b/.test(norm);
    const bad = isVegan ? ANIMAL_WORDS : MEAT_WORDS;
    for (const item of items) {
      lines.push(`- ${item} — ${itemHas(item, bad) ? `not ${isVegan ? "vegan" : "vegetarian"}.` : `${isVegan ? "vegan" : "vegetarian"} as far as this list shows.`}`);
    }
    lines.push("", "This is only from the list you typed — check the real label too.");
  }
  return lines.join("\n");
}

// ---- Barcode answers (Open Food Facts data only) ----

function barcodeAnswer(p: LocalBarcodeProduct, norm: string): string | null {
  const notFound = !p.name || p.missing.includes("product not found in Open Food Facts");
  if (notFound) {
    return [
      "I couldn't find this barcode in Open Food Facts — it may be a new, local or unlisted product.",
      "",
      "I can't tell you if it is healthy or what is in it without more information. Send a clear photo of the label, or type the ingredients, and I will go through them with you.",
      "",
    ].join("\n");
  }
  const name = p.name || "This product";
  const certQ = /\b(halal|vegetarian|vegan)\b/.test(norm);
  const allergenQ = /\ballerg/.test(norm) || /\bcontain/.test(norm);
  if (certQ) {
    return [
      `I can't confirm halal, vegetarian or vegan for ${name} from the barcode data alone.`,
      "",
      "Open Food Facts does not list certifications for this product, so I won't guess. Check the label for a halal or vegetarian mark, or send a clear photo of the label and I will go through what is written on it.",
      "",
    ].join("\n");
  }
  if (allergenQ) {
    const target = ALLERGEN_MAP.find((g) => g.words.some((w) => wholeWord(norm, w)));
    const listed = [p.ingredients || "", p.allergens || ""].join(" ");
    const lines = [
      `Here is what Open Food Facts lists for ${name} — this is crowdsourced data and can be wrong, so check the real label too.`,
      "",
    ];
    if (target) {
      const found = target.words.some((w) => wholeWord(listed, w));
      lines.push(found
        ? `${target.allergen} is listed in the product data${p.allergens ? ` (allergens listed: ${p.allergens}).` : "."}`
        : `${target.allergen} is not listed in the product data I have. That is not a guarantee — the data may be incomplete, so check the label.`);
    } else if (p.allergens) {
      lines.push(`Allergens listed: ${p.allergens}.`);
    } else {
      lines.push("No allergens are listed in the product data — that is not a guarantee. Check the label.");
    }
    if (p.ingredients) lines.push(`Ingredients listed: ${p.ingredients}.`);
    lines.push("", "Source: Open Food Facts, ODbL.");
    return lines.join("\n");
  }
  const score = (p.nutriscore || "").toLowerCase();
  const scoreLine =
    score === "a" || score === "b"
      ? "Open Food Facts gives it Nutri-Score A or B, which means it is a better choice in its category."
      : score === "c"
        ? "Open Food Facts gives it Nutri-Score C, which is in the middle of its category."
        : score === "d" || score === "e"
          ? "Open Food Facts gives it Nutri-Score D or E, which means it is best as an occasional treat."
          : "";
  // Open Food Facts categories can be a long noisy list; keep the first 3.
  const shortCategories = p.categories
    ? p.categories.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 3).join(", ")
    : "";
  const lines = [
    `Short answer: ${name}${p.brands ? ` (${p.brands})` : ""}${shortCategories ? ` — ${shortCategories}` : ""}.`,
    "",
  ];
  if (scoreLine) lines.push(scoreLine, "");
  if (p.ingredients) lines.push(`Ingredients listed: ${p.ingredients}.`);
  if (p.allergens) lines.push(`Allergens listed: ${p.allergens}.`);
  lines.push(
    "",
    "This is from Open Food Facts, which is crowdsourced — check the real label before you rely on it, especially for allergens.",
    "",
    "Source: Open Food Facts, ODbL.",
    "",
  );
  return lines.join("\n");
}

// A subject counts as a known generic food only when it IS a known food
// name, or ends with one preceded only by generic modifiers ("wheat
// bread"). A made-up brand that merely contains a generic word
// ("FizzPop cola") is NOT the generic food it resembles.
const GENERIC_MODIFIERS = new Set([
  "whole", "wheat", "white", "brown", "fresh", "boiled", "roasted", "grilled",
  "fried", "sweet", "green", "red", "black", "baby", "small", "large", "raw",
  "cooked", "plain", "salted", "spiced", "basmati", "masoor", "moong",
]);

function subjectFoods(subject: string): FoodEntry[] {
  const s = normalise(subject);
  for (const entry of FOODS) {
    if (entry.names.some((n) => normalise(n) === s)) return [entry];
  }
  const hits = findFoods(s);
  for (const hit of hits) {
    const aliasEnd = hit.start + hit.length;
    const prefix = s.slice(0, hit.start).trim();
    const prefixWords = prefix ? prefix.split(/\s+/) : [];
    if (aliasEnd >= s.length && prefixWords.every((w) => GENERIC_MODIFIERS.has(w))) return [hit.entry];
  }
  return [];
}

// ---- Brand / certification handling ----

/** Pull the product name out of a "is X halal / ingredients of X / does X contain" question, keeping the user's words. */
function extractSubject(original: string): string | null {
  const patterns = [
    /^(?:is|are)\s+(.+?)\s+(?:halal|vegetarian|vegan|veg)\b/i,
    /(?:what'?s in|what is in|ingredients?)\s+(?:of|in|the)?\s*(.+?)\s*[?.!]*$/i,
    /does\s+(.+?)\s+contain\b/i,
    /(?:is|are)\s+(.+?)\s+(?:halal|vegetarian|vegan|veg)\b/i,
  ];
  for (const re of patterns) {
    const m = original.match(re);
    if (m && m[1]) {
      const s = cleanSubject(m[1]);
      if (s && s.split(/\s+/).length <= 6) return s;
    }
  }
  return null;
}

function unverifiedReply(name: string): string {
  return [
    `I could not verify '${name}'.`,
    "",
    "I don't have verified information about this product, so I can't list its ingredients, nutrition or certifications. If you share the label, I can help: type the ingredients list, or send a clear photo of the label, and I'll go through it with you.",
    "",
  ].join("\n");
}

function genericCertReply(subject: string, kind: "halal" | "vegetarian" | "vegan"): string {
  if (kind === "halal") {
    return [
      `I can't certify ${subject} as halal without the label — halal depends on how the food was made and whether it is certified.`,
      "",
      "In general, plain meat, fish, vegetables, fruit, grains and dairy are halal in principle, but a packaged product is only confirmed halal when the label carries a halal mark. Check the pack for a halal certification mark, or send a clear photo of the label and I will go through what is written on it.",
      "",
    ].join("\n");
  }
  const kindWord = kind === "vegetarian" ? "vegetarian" : "vegan";
  return [
    `I can't confirm ${subject} as ${kindWord} without the label — it depends on the exact recipe.`,
    "",
    `In general, plain vegetables, fruit, grains and pulses are ${kindWord}, but a packaged product may contain ${kind === "vegan" ? "milk, egg, honey or gelatin" : "egg or gelatin"}. Check the ingredients list on the pack, or send a clear photo of the label and I will go through it with you.`,
    "",
  ].join("\n");
}

const CONDITION_LINES: { re: RegExp; line: string }[] = [
  { re: /\bdiabet/, line: "With diabetes, portions of sweet or starchy foods matter most — check with your doctor or dietitian." },
  { re: /\bblood pressure\b|\bhypertension\b/, line: "With high blood pressure, salt matters — keep salty foods occasional." },
  { re: /\bweight loss\b|\blose weight\b/, line: "For weight loss, portions and how often you eat it matter most." },
  { re: /\bpregnan/, line: "In pregnancy, eat it fresh and well cooked, and ask your doctor about anything you are unsure of." },
  { re: /\bcholesterol\b/, line: "With high cholesterol, fatty and fried foods are best kept occasional." },
  { re: /\bkidney\b/, line: "With kidney problems, salt, potassium and protein portions all matter — check with your doctor or dietitian." },
];

function conditionLine(norm: string): string | null {
  const hit = CONDITION_LINES.find((c) => c.re.test(norm));
  return hit ? hit.line : null;
}

// ---- Topic guides (v2): meal ideas, health topics, market and hotel food ----

const BREAKFAST_IDEAS = `Breakfast ideas — light, filling, and quick:

- Oats porridge with banana or dates — filling and gentle on the stomach.
- Masala omelette with roti — protein that keeps you full till lunch.
- Boiled egg with toast — simple and quick.
- Paratha with yogurt — filling, but go easy on the oil.
- Chana chaat or a piece of fruit — light, for days when you are not very hungry.

A good breakfast has some protein and some fibre — it keeps you full far longer than just tea and biscuits.

Do you usually eat a big breakfast or something light?`;

const LUNCH_IDEAS = `Lunch ideas — a full plate without feeling heavy:

- Daal chawal with salad — cheap, filling, and a good everyday plate.
- Roti with sabzi and yogurt — light and full of fibre.
- Chicken curry with roti — keep the oil low and add salad.
- Chana chaat with a boiled egg — quick, high in protein.
- Khichdi with yogurt — gentle and easy to digest.

Half your plate vegetables, a quarter roti or rice, a quarter protein — that is the shape of a good lunch.

Do you eat lunch at home or outside?`;

const DINNER_IDEAS = `Dinner ideas — lighter is better late in the day:

- Vegetable soup or daal soup — warm, light, and easy on the stomach.
- Grilled chicken or fish with salad — protein without heaviness.
- Khichdi with yogurt — a classic light dinner.
- Roti with sabzi — simple and filling.
- A small bowl of daal with a little rice — light and satisfying.

Dinner is best kept lighter than lunch, and not too late — heavy fried food at night sits badly.

What time do you usually eat dinner?`;

const WHAT_TO_EAT = `What should you eat? Here's a simple rule for most days:

- Half your plate vegetables — sabzi, salad, or any green you have.
- A quarter roti or rice — whole wheat roti is better than white bread.
- A quarter protein — daal, egg, chicken, fish, or chickpeas.
- Water with the meal — plain water beats soft drinks.
- Fruit for a snack — a banana or an apple beats biscuits most days.

That plate works for most healthy people most days. If you have diabetes, blood pressure, or another condition, tell me which one and I will adjust it.

Tell me what you have at home and I will suggest something from it.`;

const WEIGHT_LOSS_GUIDE = `Losing weight, the steady way:

- Smaller portions — one roti instead of two, and a smaller plate of rice.
- Half your plate vegetables — they fill you up with very few calories.
- Cut back on sugar and fried food — soft drinks, biscuits, and fried snacks add up fast.
- Drink water before meals — it genuinely helps with portions.
- Walk daily — even a short walk after meals helps.

There is no quick fix, and crash diets do more harm than good — slow and steady is the way that lasts.

If you have diabetes, blood pressure, or any medical condition, please check with your doctor before changing your diet.`;

const WEIGHT_GAIN_GUIDE = `Gaining weight in a healthy way:

- Eat more often — three meals plus a snack or two.
- Add energy-rich foods — milk, eggs, nuts, peanut butter, daal, and roti.
- A glass of milk with breakfast and before bed — an easy way to add calories.
- Nuts and dates as snacks — small, but full of energy.
- Don't skip meals — and don't rely on junk food to gain weight.

Healthy weight gain is about eating more good food, not just more food.

If you are losing weight without trying, please see a doctor — that is worth checking.`;

const PROTEIN_GUIDE = `Foods rich in protein:

- Eggs — the cheapest good protein around.
- Chicken and fish — grilled is better than fried.
- Daal, chickpeas and beans — protein plus fibre, and cheap.
- Yogurt and paneer — good with any meal.
- Nuts and seeds — a handful a day goes a long way.

For muscle, protein works together with exercise — food alone won't build muscle, and exercise alone won't either. You need both.

Do you exercise regularly, or are you starting out?`;

const DIABETES_GUIDE = `Eating with diabetes — general guidance:

- Whole grains over white — whole wheat roti and brown rice are better than white bread and white rice.
- Daal, chickpeas and vegetables — they fill you up without spiking sugar.
- Less sugar and sweet drinks — soft drinks, packaged juice, and sweet tea are the biggest problem.
- Fruit is fine, whole fruit — eat it, don't drink it as juice.
- Small, regular meals — and watch the portion of rice and roti.

This is general information, not medical advice — please check with your doctor or a dietitian for your own plan.`;

const BP_GUIDE = `Eating with high blood pressure — general guidance:

- Less salt — the biggest single change. Taste before adding more.
- Less packaged food — chips, namkeen, instant noodles, and pickles are all very salty.
- More vegetables and fruit — they help more than most people realise.
- Less fried food — and measure the oil instead of pouring freely.
- More water, less soft drink — soft drinks add salt and sugar both.

This is general information, not medical advice — please check with your doctor for your own plan.`;

const KIDS_GUIDE = `Food for kids — lunchbox and everyday ideas:

- Roti roll with egg or chicken — easy to carry and filling.
- A small box of fruit — banana, apple, or grapes.
- Yogurt or milk — calcium for growing bones.
- Chana chaat or boiled egg — protein that keeps them full at school.
- Nuts and dates — a small handful as a snack.

Kids need energy, so don't cut their food back — just keep the sugary snacks and soft drinks occasional.

For a child with a medical condition, please ask your doctor first.`;

const PREGNANCY_GUIDE = `Eating during pregnancy — general guidance:

- Fresh, well-cooked food — daal, roti, vegetables, egg, and milk are all good everyday foods.
- Wash fruit and vegetables well — and drink boiled or clean water.
- Avoid raw or undercooked food — meat, eggs, and fish should be fully cooked.
- Small, frequent meals — they help with nausea and acidity.
- Milk and yogurt — calcium matters, and they are easy to digest.

This is general information only — please ask your doctor about anything you are unsure of.`;

const BUDGET_GUIDE = `Healthy food on a tight budget:

- Daal, chana, and beans — the cheapest protein there is.
- Eggs — cheap, filling, and full of protein.
- Seasonal vegetables — whatever is in season is cheapest and freshest.
- Bananas and seasonal fruit — the cheapest fruit, and genuinely good for you.
- Roti over bread — whole wheat roti is cheaper and better than white bread.

Healthy eating doesn't need expensive food — daal, roti, sabzi, and eggs are the cheapest good meals there are.

What is your usual monthly food budget like?`;

const SICK_GUIDE = `What to eat when you are sick — general guidance:

- Plenty of fluids — water, soup, and nimbu pani. Don't let yourself get dehydrated.
- Khichdi with yogurt — gentle, easy to digest, and filling.
- Plain toast or plain rice — light and easy on the stomach.
- Soup with vegetables — warm and soothing.
- Small amounts, often — a little at a time beats a big meal.

Avoid very spicy, fried, or heavy food while you are recovering.

See a doctor quickly if the fever lasts, breathing is hard, or you can't keep fluids down.`;

const WORKOUT_GUIDE = `Eating around a workout:

- Before a workout — a banana, toast, or a small bowl of oats. Light and easy to digest.
- After a workout — egg, chicken, daal, or yogurt. Protein helps recovery.
- Water, always — drink before, during, and after.
- Skip heavy fried food before exercise — it sits badly.

Food and exercise work together — neither does the job alone.

Do you work out in the morning or the evening?`;

const PACKAGED_SNACKS_GUIDE = `Packaged snacks in the market — what they are and what to watch for:

Chips, namkeen, biscuits, instant noodles, chocolates, candies, packaged juices, energy drinks, and bakery items are all packaged snacks — made to last on a shelf, so they are usually high in salt, sugar, or oil, and low in nutrients.

What to watch for:
- Salt — chips and namkeen are the worst for this.
- Sugar — biscuits, chocolates, candies, and packaged juices are mostly sugar.
- Oil and fat — instant noodles and fried snacks are cooked in a lot of oil.
- Additives — colours and flavourings are usually safe in small amounts, but they add nothing good.

What to check on the label:
- Ingredients, in order — the first ingredient is the main one.
- Per 100 g — compare salt and sugar between two packs.
- Expiry date — never eat expired snacks.

Better daily snacks: roasted chana, fruit, a handful of nuts, yogurt, or popcorn — they fill you up properly.

How often do you eat packaged snacks?`;

const MARKET_GUIDE = `Daily food from the market — unpackaged, fresh food:

- Street food — tasty and fresh when made in front of you, but often oily and salty. Eat it fresh, from a clean place, in small portions.
- Bakery bread and naan — fresh from the tandoor is fine, but it is white flour, so pair it with egg, daal, or curry — not just butter and jam.
- Fresh market produce — vegetables and fruit are cheapest and freshest in season. Wash them well before eating.
- Loose lentils, rice, and spices — check for stones, dampness, and a bad smell before you buy. Buy small amounts and store them dry.
- Dahi from the shop — buy it fresh, keep it cold, and finish it the same day.
- Milk from the shop — always boil it well before drinking, and never drink it raw.

Fresh food is great — it just needs a little more care than packaged food.`;

const EATING_OUT_GUIDE = `Hotel and restaurant food — enjoying it without overdoing it:

- Grilled over fried — tikka, BBQ, and grilled chicken are lighter than fried items.
- Biryani and karahi — tasty, but hotel versions use more oil and salt than homemade. A small portion with salad and raita is the way.
- Fast food — burgers, fries, pizza, and shawarma are fine occasionally, but they are salty, oily, and low in nutrients.
- Continental dishes — grilled is good, creamy sauces and fried items are heavy.
- Chai and doodh patti — lovely, but ask for less sugar.

Simple rules for eating out: small portions, salad with the meal, water instead of soft drinks, and share the dessert.

Do you eat out often, or only on special occasions?`;

const CALORIES_GUIDE = `Calories — roughly, not exactly:

These are rough ranges, not exact numbers — size, recipe, and portion change them a lot:

- A medium roti — roughly 70–100 calories
- A small plate of cooked white rice — roughly 150–250 calories
- A small bowl of daal — roughly 100–200 calories
- One boiled egg — roughly 60–80 calories
- One medium banana — roughly 90–120 calories
- One glass of milk — roughly 120–160 calories
- One slice of bread — roughly 70–100 calories

The honest point: exact calories matter less than the portion. A small plate of an everyday food beats a big plate of a treat — and plain, home-cooked food is almost always lighter than packaged or fried food.

Want the rough range for a specific food? Just ask — for example, "how many calories in a roti?"`;

/** Rough calorie ranges, clearly labelled as rough — the only place digits appear. */
const CALORIE_RANGES: Record<string, string> = {
  roti: "roughly 70–100 calories",
  "white rice": "roughly 150–250 calories",
  "brown rice": "roughly 150–250 calories",
  daal: "roughly 100–200 calories",
  egg: "roughly 60–80 calories",
  banana: "roughly 90–120 calories",
  apple: "roughly 70–100 calories",
  milk: "roughly 120–160 calories",
  chicken: "roughly 120–200 calories",
  bread: "roughly 70–100 calories",
  potato: "roughly 100–150 calories",
  oats: "roughly 150–250 calories",
  yogurt: "roughly 80–120 calories",
  biscuits: "roughly 100–150 calories",
  cola: "roughly 100–150 calories",
};

function caloriesAnswer(foods: { entry: FoodEntry }[]): string {
  const named = foods[0]?.entry;
  if (named) {
    const range = CALORIE_RANGES[named.display.toLowerCase()];
    if (range) {
      return [
        `${named.display} — roughly: a medium serving is ${range}.`,
        "",
        "That's a rough range, not an exact number — size, recipe and portion change it a lot.",
        "",
        "In general, the exact calories matter less than the portion: a small plate of an everyday food beats a big plate of a treat.",
        "",
      ].join("\n");
    }
    return [
      `I don't have a rough calorie range for ${named.display.toLowerCase()} in my local knowledge.`,
      "",
      "In general, plain everyday foods — daal, roti, vegetables, fruit — are lighter than fried or sugary foods, and the portion matters most.",
      "",
      "A key in Settings unlocks fuller answers.",
    ].join("\n");
  }
  return CALORIES_GUIDE;
}

const SUBSTITUTIONS: { keys: string[]; text: string }[] = [
  { keys: ["sugar"], text: "Try half the sugar first — most chai and desserts taste fine with less. Dates or a little honey work in cooking, but they are sweet too, so the amount matters more than the swap." },
  { keys: ["salt"], text: "Lemon, green chilli, and fresh coriander add flavour without salt. Taste the food before adding more salt." },
  { keys: ["butter"], text: "A little oil works in cooking, or yogurt for the same creamy job." },
  { keys: ["ghee"], text: "A little oil instead — same flavour job, much lighter." },
  { keys: ["oil"], text: "Measure it with a spoon instead of pouring freely — most recipes need far less than we pour." },
  { keys: ["milk"], text: "Skimmed milk works, or yogurt thinned with water." },
  { keys: ["white flour", "maida", "flour"], text: "Whole wheat flour (atta) instead — more fibre, and it keeps you full longer." },
  { keys: ["white bread", "bread"], text: "Whole wheat bread instead — more fibre for the same meal." },
  { keys: ["white rice", "rice"], text: "Brown rice instead, or half rice and half vegetables on the same plate." },
  { keys: ["cream"], text: "Yogurt instead — same creaminess, much lighter." },
  { keys: ["cheese"], text: "Paneer instead, or just a smaller amount of cheese." },
  { keys: ["mayonnaise"], text: "Yogurt with a little lemon instead — creamy, but much lighter." },
  { keys: ["honey"], text: "Dates instead, or simply less honey — honey is still sugar, so the amount matters most." },
  { keys: ["jaggery", "gur"], text: "Jaggery is still sugar — use less of it, not more." },
  { keys: ["egg", "eggs"], text: "In baking, mashed banana or yogurt can replace an egg." },
  { keys: ["meat", "chicken", "beef", "gosht"], text: "Daal, chickpeas, or paneer give you protein without meat." },
  { keys: ["cola", "soft drink", "soft drinks"], text: "Water, soda water with lemon, or nimbu pani with little sugar instead." },
  { keys: ["chips", "potato chips"], text: "Roasted chana or plain popcorn instead — crunchy, but far less oily and salty." },
  { keys: ["biscuits", "biscuit"], text: "Plain rusk, or a piece of fruit with your tea." },
];

function substitutionAnswer(foods: { entry: FoodEntry }[]): string {
  const named = foods[0]?.entry;
  if (named) {
    const key = named.display.toLowerCase();
    const hit = SUBSTITUTIONS.find((s) => s.keys.includes(key) || named.names.some((n) => s.keys.includes(n)));
    if (hit) {
      return [
        `Instead of ${named.display.toLowerCase()}: ${hit.text}`,
        "",
        "Want a swap for something else? Just ask.",
      ].join("\n");
    }
    return [
      `I don't have a swap for ${named.display.toLowerCase()} in my local knowledge yet.`,
      "",
      "In general: swap fried for grilled, sugary for plain, and white flour for whole wheat — those three swaps help almost every dish.",
      "",
    ].join("\n");
  }
  return [
    "Common food swaps:",
    "",
    "- Sugar — use half, or dates in cooking.",
    "- Salt — lemon, green chilli, and fresh coriander.",
    "- Butter or ghee — a little oil, or yogurt.",
    "- White rice — brown rice, or half rice and half vegetables.",
    "- Cream — yogurt, same creaminess, much lighter.",
    "- Cola — water, or soda water with lemon.",
    "",
    "Ask about a specific food — for example, \"what can I use instead of sugar?\" — and I will give you a direct swap.",
  ].join("\n");
}

/** Topic routing: health and meal topics when no specific food is named. */
function topicGuide(norm: string): string | null {
  if (/\b(diabetes|diabetic|sugar ka marz|shakkar ka marz)\b/.test(norm)) return DIABETES_GUIDE;
  if (/\b(blood pressure|hypertension|\bbp\b)\b/.test(norm)) return BP_GUIDE;
  if (/\b(weight loss|lose weight|losing weight|wazan kam|motapa kam)\b/.test(norm)) return WEIGHT_LOSS_GUIDE;
  if (/\b(weight gain|gain weight|gaining weight|wazan barhana|wazan badhana|mota hona)\b/.test(norm)) return WEIGHT_GAIN_GUIDE;
  if (/\b(workout|exercise|before (a )?workout|after (a )?workout|before gym|after gym)\b/.test(norm)) return WORKOUT_GUIDE;
  if (/\b(muscle|protein)\b/.test(norm)) return PROTEIN_GUIDE;
  if (/\b(kid|kids|children|bacha|bachon|bachay|bachche)\b/.test(norm)) return KIDS_GUIDE;
  if (/\b(pregnancy|pregnant|hamal)\b/.test(norm)) return PREGNANCY_GUIDE;
  if (/\b(budget|sasta|cheap|kam kharch)\b/.test(norm)) return BUDGET_GUIDE;
  if (/\b(sick|fever|bukhar|bimar|flu|have a cold)\b/.test(norm)) return SICK_GUIDE;
  if (/\b(packaged snack|packet snack|market snack|snacks?)\b/.test(norm)) return PACKAGED_SNACKS_GUIDE;
  if (/\b(market|bazaar|unpackaged|loose)\b/.test(norm)) return MARKET_GUIDE;
  if (/\b(hotel|restaurant|eating out|bahar khana|dine out)\b/.test(norm)) return EATING_OUT_GUIDE;
  if (/\b(breakfast|nashta|subah ka khana)\b/.test(norm)) return BREAKFAST_IDEAS;
  if (/\b(lunch|dopahar ka khana|dopahar)\b/.test(norm)) return LUNCH_IDEAS;
  if (/\b(dinner|raat ka khana|shaam ka khana)\b/.test(norm)) return DINNER_IDEAS;
  if (/\bwhat (should|can) i eat\b/.test(norm)) return WHAT_TO_EAT;
  return null;
}

/** Category-level guidance for the fallback — never a made-up fact about one product. */
const CATEGORY_GUIDANCE: { words: string[]; text: string }[] = [
  { words: ["fruit"], text: "Fruit in general is a good everyday choice — fibre and vitamins, best eaten whole rather than as juice." },
  { words: ["vegetable", "sabzi"], text: "Vegetables are the safest everyday food — fill half your plate with them when you can." },
  { words: ["meat", "gosht"], text: "Meat gives protein — grilled is lighter than fried, and lean cuts are better than fatty ones." },
  { words: ["fish", "machli"], text: "Fish gives protein — grilled is lighter than fried." },
  { words: ["drink", "juice", "soda", "cola"], text: "Most sweet drinks are sugar water — water, soda water with lemon, or plain lassi are lighter choices." },
  { words: ["snack"], text: "For a daily snack, roasted chana, fruit, nuts, or yogurt beat packaged snacks — less salt, less sugar." },
  { words: ["bread", "naan", "roti"], text: "Bread is a staple — whole wheat is better than white, and one or two pieces are usually enough." },
  { words: ["rice", "chawal"], text: "Rice is filling — brown rice has more fibre than white, and the portion matters most." },
  { words: ["curry", "salan"], text: "Curries are as healthy as their oil and salt — keep the oil low and load the vegetables." },
  { words: ["dessert", "sweet", "mithai"], text: "Desserts are treats — enjoy a small portion occasionally, not every day." },
  { words: ["dairy", "milk", "doodh", "yogurt", "dahi"], text: "Dairy gives calcium and protein — plain yogurt and milk are everyday foods, sweetened ones are treats." },
  { words: ["oil", "ghee"], text: "Oil and ghee are pure fat — a spoonful for cooking is enough, and measuring beats pouring freely." },
  { words: ["spice", "masala"], text: "Spices add flavour with almost no calories — turmeric, cumin, and coriander are everyday friends." },
];

const FOODISH = /\b(eat|eating|food|khana|khaun|khaon|diet|health|healthy|calori|protein|vitamin|sugar|salt|fat|recipe|cook|cooking|label|ingredient|allerg|halal|hungry|breakfast|lunch|dinner|nashta|wazan|sehat|bimar|bacha|bachon|pregnan|hamal|budget|sasta|muscle|gym|workout|juice|drink|snack|fruit|vegetable|sabzi|daal|roti|rice|chicken|meat|fish|milk|egg|bread|oil|spice|meal|plate|pizza|burger|shawarma|tikka|curry|sweet|dessert|tea|chai|coffee)\b/;

/** Improved fallback: category guidance plus exactly what would help — never a dead end. */
function helpfulFallback(norm: string, original: string): string | null {
  if (!FOODISH.test(norm)) return null;
  const subject = extractSubject(original);
  const cat = CATEGORY_GUIDANCE.find((c) => c.words.some((w) => wholeWord(norm, w)));
  const lines = [
    subject
      ? `I don't have ${subject} in my local knowledge yet, so I can't give you a specific answer on it.`
      : "I don't have that in my local knowledge yet, so I can't give you a specific answer.",
    "",
  ];
  if (cat) lines.push(cat.text, "");
  lines.push(
    "What would help most: send a clear photo of the label, type the ingredients, or scan the barcode — then I can go through it with you.",
    "",
    "A key in Settings unlocks fuller answers.",
  );
  return lines.join("\n");
}

// ---- Main entry point ----

/**
 * Answer a food question from local knowledge. Returns null when the
 * question cannot be answered locally — the caller then falls back to
 * the normal cloud path.
 */
export function answerLocally(question: string, ctx?: { barcodeData?: LocalBarcodeProduct; history?: { role: string; text: string }[] }): string | null {
  const original = question.trim();
  if (!original) return null;
  const norm = normalise(original);
  if (!norm) return null;

  // Barcode questions use the scanned product data (Open Food Facts).
  if (ctx?.barcodeData && /\b(health|healthy|watch|safe|good|bad|eat|ingredient|contain|allerg|halal|vegetarian|vegan|sugar|salt|fat|nutrition|label|score|nutri|this)\b/.test(norm)) {
    return barcodeAnswer(ctx.barcodeData, norm);
  }

  const foods = findFoods(norm);

  // Greetings and identity — only when the message is just a greeting
  // (a greeting followed by a food question goes to the food answer).
  const greetStripped = norm.replace(/^(hi|hello|hey|salaam|assalam|salam|aoa|good (morning|evening|afternoon))[,!\s]*/, "");
  if (
    (/^(hi|hello|hey|salaam|assalam|salam|aoa|good (morning|evening|afternoon))\b/.test(norm) ||
      /\bwho are you\b/.test(norm) ||
      /\bwhat can you do\b/.test(norm)) &&
    (greetStripped === "" || /^(how are you|who are you|what can you do|what'?s up)\b/.test(greetStripped))
  ) {
    return GREETING;
  }

  // ---- Follow-ups from the recent chat (multi-turn, v2) ----
  const prevTurns = ctx?.history ?? [];
  const prevUser = [...prevTurns].reverse().find((m) => m.role === "user");
  const prevAsst = [...prevTurns].reverse().find((m) => m.role === "assistant");
  let prevFood: FoodEntry | null = null;
  if (prevUser) {
    const h = findFoods(normalise(prevUser.text));
    if (h.length > 0) prevFood = h[0].entry;
  }
  if (!prevFood && prevAsst) {
    const h = findFoods(normalise(prevAsst.text));
    if (h.length > 0) prevFood = h[0].entry;
  }
  if (prevFood && prevTurns.length > 0) {
    // Bare "why?" / "tell me more" — only when no new food is named.
    if (foods.length === 0 && /^(why|why is that|why is it|how come|tell me more|more|and\?)\b/.test(norm)) {
      return whyAnswer(prevFood);
    }
    // Bare "yes" to the closer question at the end of the last answer.
    if (foods.length === 0 && /^(yes|yeah|haan|ji|ok|okay|sure|please|batayen|batao)\b/.test(norm)) {
      const lastAsst = prevAsst?.text || "";
      if (/recipe/i.test(lastAsst)) {
        const recipe = recipeFor(prevFood) || genericRecipe(prevFood);
        if (recipe) return recipeLines(recipe);
      }
      if (/compare/i.test(lastAsst)) {
        return "Tell me the other food — for example, \"compare it with roti\" — and I will compare them for you.";
      }
      return whyAnswer(prevFood);
    }
    // "is that better than X?" / "compare it with X"
    const betterThan = norm.match(/^(?:is|was) (?:that|this|it) (?:better|healthier) than (.+)/) || norm.match(/compare (?:it|that|this) with (.+)/);
    if (betterThan) {
      const other = findFoods(normalise(betterThan[1]));
      if (other.length > 0) return compareAnswer(prevFood, other[0].entry);
    }
    // "is that healthy?" / "is that good for diabetes?" / "is that halal?" / "does it contain peanuts?"
    if (foods.length === 0 && /^(?:is|was|does|do) (?:that|this|it)\b/.test(norm)) {
      const cert = norm.match(/\b(halal|vegetarian|vegan)\b/);
      if (cert) return genericCertReply(prevFood.display.toLowerCase(), cert[1] as "halal" | "vegetarian" | "vegan");
      if (/\ballerg|contain/.test(norm)) {
        return [
          `I can't confirm allergens for ${prevFood.display.toLowerCase()} from a name alone — it depends on the exact packet.`,
          "",
          "Check the ingredients list on the pack for bold allergen words, or send a clear photo of the label and I will go through it with you.",
          "",
        ].join("\n");
      }
      if (/\bcalori/.test(norm)) return caloriesAnswer([{ entry: prevFood }]);
      return foodAnswer(prevFood, conditionLine(norm) || undefined);
    }
    // "or X?" / "and what about X?" / "what about X?"
    const orFood = norm.match(/^(?:or|and what about|what about|and)\s+(.+)/);
    if (orFood) {
      const other = findFoods(normalise(orFood[1]));
      if (other.length > 0 && other[0].entry !== prevFood) {
        if (/\bbetter|healthier\b/.test(norm)) return compareAnswer(prevFood, other[0].entry);
        return foodAnswer(other[0].entry);
      }
    }
    // "and for diabetes?" — a bare condition follow-up about the last food.
    if (/^(and )?(for|with) /.test(norm) && conditionLine(norm)) {
      return foodAnswer(prevFood, conditionLine(norm) || undefined);
    }
  }

  // Label-reading help.
  if (/\blabel\b/.test(norm) && /\b(read|understand|help|mean|explain)\b/.test(norm)) {
    return LABEL_GUIDE;
  }

  // "What are these ingredients?" with no list given yet.
  if (/what are (these|the) ingredients/.test(norm) && !extractList(original)) {
    const subject = extractSubject(original);
    if (subject && !/^(these|the|this)\b/i.test(subject)) {
      const subjectFoodsResult = subjectFoods(subject);
      if (subjectFoodsResult.length > 0) return foodAnswer(subjectFoodsResult[0]);
      return unverifiedReply(subject);
    }
    return [
      "Type the ingredients list, or send a clear photo of the label, and I will go through them one by one — including anything about allergens.",
      "",
      "For example, type: \"Wheat flour, sugar, palm oil, milk powder\" and ask what you want to know about them.",
      "",
    ].join("\n");
  }

  // Typed ingredient lists (allergen / halal / vegetarian checks).
  const listAnswer = analyseTypedList(original, norm);
  if (listAnswer) return listAnswer;

  // Certification questions about a named product.
  const certMatch = norm.match(/\b(halal|vegetarian|vegan)\b/);
  const allergenCertQ = /\bcontain/.test(norm) && ALLERGEN_MAP.some((g) => g.words.some((w) => wholeWord(norm, w)));
  if (certMatch || allergenCertQ) {
    const subject = extractSubject(original);
    if (subject) {
      const hits = subjectFoods(subject);
      const isCategory = /^(this|these|that|those)\b/i.test(subject);
      if (hits.length > 0 && !isCategory) {
        // A known generic food: explain generally, never certify.
        if (certMatch) return genericCertReply(hits[0].display.toLowerCase(), certMatch[1] as "halal" | "vegetarian" | "vegan");
        return foodAnswer(hits[0], "Allergens: I can't confirm allergens for a specific packet without the label — check the ingredients list for bold allergen words, or send a photo of the label.");
      }
      if (isCategory) {
        const foodHits = findFoods(norm);
        if (certMatch && foodHits.length > 0) return genericCertReply(foodHits[0].entry.display.toLowerCase(), certMatch[1] as "halal" | "vegetarian" | "vegan");
        return [
          "I can't confirm that without the label — it depends on the exact recipe of the packet you have.",
          "",
          "Check the ingredients list on the pack for the ingredient you are asking about, or send a clear photo of the label and I will go through it with you.",
          "",
        ].join("\n");
      }
      return unverifiedReply(subject);
    }
  }

  // ---- Topic intents (v2): calories, substitutions, pros/cons, guides ----
  if (/\bcalori/.test(norm)) return caloriesAnswer(foods);
  if (/\binstead of\b|\breplace\b|\bsubstitut|\bki jagah\b|\bbadlay\b/.test(norm)) return substitutionAnswer(foods);
  if (/\bpros and cons\b|\bfaide\b|\bnuksan\b/.test(norm) && foods.length > 0) return prosConsAnswer(foods[0].entry);
  if (foods.length === 0) {
    const topic = topicGuide(norm);
    if (topic) return topic;
  }

  const isCooking = /\b(cook|recipe|make|prepare)\b/.test(norm);
  const isHealth = /\b(healthy|health|good for|bad for|nutritious|is it (ok|okay|fine)|safe to eat)\b/.test(norm);
  const isWhatIn = /\b(what'?s in|what is in)\b/.test(norm);
  const isCompare = /\b(vs|versus|better|healthier|or)\b/.test(norm) && foods.length >= 2;
  const isStorage = /\b(store|storage|how long|fridge|freezer|keep|expired|gone off|still (good|safe|ok|okay))\b/.test(norm);

  // "What can I cook today?" with no ingredient named.
  if (/what can i cook (today|tonight|now)/.test(norm) && foods.length === 0) {
    return COOK_TODAY;
  }

  // "What's on my plate?"
  if (/what'?s on my plate/.test(norm)) {
    return PLATE_GUIDE;
  }

  // Cooking with a named ingredient.
  if (isCooking && foods.length > 0) {
    const entry = foods[0].entry;
    const recipe = recipeFor(entry) || genericRecipe(entry);
    if (recipe) return recipeLines(recipe);
    return null;
  }

  // Comparison of two foods.
  if (isCompare) {
    return compareAnswer(foods[0].entry, foods[1].entry);
  }

  // Storage and expiry.
  if (isStorage) {
    if (foods.length > 0) {
      const e = foods[0].entry;
      return [
        `Storing ${e.display.toLowerCase()}: keep it cool and covered, and use it while it is fresh.`,
        "",
        "In general: keep cooked food in the fridge and eat it within a day or two, keep dry foods sealed and away from damp, and never taste food to check if it is safe.",
        "",
        "When in doubt, throw it out — smell and looks can't prove food is safe.",
        "",
      ].join("\n");
    }
    return [
      "Storing food, in general: keep cooked food in the fridge and eat it within a day or two, keep dry foods sealed and away from damp, and follow the date on the pack.",
      "",
      "When in doubt, throw it out — smell and looks can't prove food is safe.",
      "",
    ].join("\n");
  }

  // Health / "what's in it" questions about a known food.
  if ((isHealth || isWhatIn) && foods.length > 0) {
    const extra = conditionLine(norm);
    const first = foodAnswer(foods[0].entry, extra || undefined);
    if (foods.length > 1) {
      return `${first}\n\nAnd ${foods[1].entry.display}: ${foods[1].entry.blurb}`;
    }
    return first;
  }

  // A food is named with no clear intent: give its short answer.
  if (foods.length > 0 && !isCooking) {
    return foodAnswer(foods[0].entry, conditionLine(norm) || undefined);
  }

  // Improved fallback: category guidance plus what would help — never a dead end.
  return helpfulFallback(norm, original);
}
