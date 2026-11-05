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
    blurb: "Instant noodles are quick but usually high in salt and low in nutrients.",
    pros: ["quick and cheap"],
    cons: ["very salty, low fibre"],
    tip: "Add vegetables and an egg to make them a real meal." },
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
    blurb: "Most packaged biscuits are a treat, not a health food — refined flour, sugar and palm oil.",
    pros: ["quick snack with tea"],
    cons: ["sugar and refined flour, low fibre"],
    tip: "One or two biscuits with tea is fine for most people. Check the label for sugar — lower is better." },
  { names: ["chip", "chips", "crisps"], display: "Potato chips", verdict: "treat",
    blurb: "Potato chips are a salty, fatty snack — tasty, but not a health food.",
    pros: ["crunchy and satisfying"],
    cons: ["high in salt and fat"],
    tip: "A small pack once in a while, not every day." },
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
    blurb: "Chocolate is a treat — dark chocolate in small amounts is the better choice.",
    pros: ["dark chocolate has some antioxidants"],
    cons: ["sugar and fat"],
    tip: "A few squares of dark chocolate, not a whole bar." },
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
    blurb: "Energy drinks are not a health drink — they are high in sugar and caffeine.",
    pros: ["none for health"],
    cons: ["sugar and caffeine, can affect sleep and heart"],
    tip: "Best avoided; water and sleep are better energy.",
    careful: "Not for children or teenagers." },
  { names: ["fruit juice", "juice"], display: "Fruit juice", verdict: "sometimes",
    blurb: "Fruit juice is sweet — it has vitamins, but it loses the fibre of the whole fruit.",
    pros: ["vitamins"],
    cons: ["sugar without fibre"],
    tip: "A small glass of fresh juice, or eat the fruit instead." },
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
    careful: "No honey for babies under 12 months." },
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

function foodAnswer(entry: FoodEntry, extra?: string): string {
  const lines = [
    `**Short answer:** ${entry.blurb}`,
    "",
    `**What's good:** ${entry.pros.join("; ")}.`,
    `**Watch out for:** ${entry.cons.join("; ")}.`,
    `**How to enjoy it:** ${entry.tip}`,
  ];
  if (entry.careful) lines.push(`**Who should be careful:** ${entry.careful}`);
  if (extra) lines.push(extra);
  return lines.join("\n");
}

function compareAnswer(a: FoodEntry, b: FoodEntry): string {
  const rank: Record<Verdict, number> = { everyday: 2, sometimes: 1, treat: 0 };
  const better = rank[a.verdict] > rank[b.verdict] ? a : rank[b.verdict] > rank[a.verdict] ? b : null;
  const lines = [
    `**Short answer:** ${better ? `${better.display} is the better everyday choice of the two.` : `${a.display} and ${b.display} are roughly similar — both are fine in modest amounts.`}`,
    "",
    `**${a.display}:** ${a.blurb}`,
    `**${b.display}:** ${b.blurb}`,
    "",
    `**How to enjoy them:** ${a.tip} ${b.tip}`,
    "",
  ];
  return lines.join("\n");
}

const LABEL_GUIDE = `**Reading a food label — the quick version:**

**Per 100 g is the fair comparison.** Packets show nutrition per serving and per 100 g — always compare the per 100 g column, because serving sizes differ between brands.

**Sugar, salt and fat:** lower is usually better. The traffic-light colours on some packs help: green means low, amber means medium, red means high.

**Ingredients are listed heaviest first.** The first ingredient is the biggest part of the food. If sugar, palm oil or refined flour is first, it is mostly that.

**Allergens are in bold.** Wheat, milk, egg, peanut, nuts, soy, sesame, fish and mustard must be highlighted in the ingredients list — check there first.

**Dates and storage:** check the use-by date and how to store it. When in doubt about a date or a smell, throw it out.

Send a clear photo of the label, or type the ingredients, and I will go through them with you.`;

const PLATE_GUIDE = `**A balanced plate, in general:**

Fill about half the plate with vegetables or salad, about a quarter with protein (daal, chicken, egg, fish or paneer), and about a quarter with grains (roti or rice). Add a spoon of yogurt if you like.

Tell me what you actually ate — for example "rice, chicken curry and salad" — and I will say how it looks.`;

const COOK_TODAY = `**Three quick ideas from everyday ingredients:**

**Chana chaat** — boiled chickpeas with onion, tomato, lemon and chaat masala. No cooking needed.

**Masala omelette with roti** — eggs with onion, tomato and green chilli, folded and served with roti.

**Daal with rice and salad** — simple daal tadka, rice and a cucumber salad. A complete, balanced meal.

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
        lines.push(`- **${item}** — ${hit ? `contains ${target.allergen}.` : `not related to ${target.allergen}.`}`);
      } else {
        lines.push(`- **${item}** — ${groups.length ? `contains ${groups.join(", ")}.` : "no major allergen in this item."}`);
      }
    }
    lines.push("", "This only covers what you typed — always check the real label too, because recipes change and \"may contain\" warnings matter.");
  } else if (isHalalQ) {
    for (const item of items) {
      if (itemHas(item, NON_HALAL_WORDS)) lines.push(`- **${item}** — not halal.`);
      else if (itemHas(item, AMBIGUOUS_HALAL_WORDS)) lines.push(`- **${item}** — I can't tell from the name alone; check the label for the source or a halal mark.`);
      else lines.push(`- **${item}** — no obvious problem in this list.`);
    }
    lines.push("", "Halal also depends on certification — check the label for a halal mark.");
  } else {
    const isVegan = /\bvegan\b/.test(norm);
    const bad = isVegan ? ANIMAL_WORDS : MEAT_WORDS;
    for (const item of items) {
      lines.push(`- **${item}** — ${itemHas(item, bad) ? `not ${isVegan ? "vegan" : "vegetarian"}.` : `${isVegan ? "vegan" : "vegetarian"} as far as this list shows.`}`);
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
        ? `**${target.allergen} is listed** in the product data${p.allergens ? ` (allergens listed: ${p.allergens}).` : "."}`
        : `**${target.allergen} is not listed** in the product data I have. That is not a guarantee — the data may be incomplete, so check the label.`);
    } else if (p.allergens) {
      lines.push(`**Allergens listed:** ${p.allergens}.`);
    } else {
      lines.push("No allergens are listed in the product data — that is not a guarantee. Check the label.");
    }
    if (p.ingredients) lines.push(`**Ingredients listed:** ${p.ingredients}.`);
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
    `**Short answer:** ${name}${p.brands ? ` (${p.brands})` : ""}${shortCategories ? ` — ${shortCategories}` : ""}.`,
    "",
  ];
  if (scoreLine) lines.push(scoreLine, "");
  if (p.ingredients) lines.push(`**Ingredients listed:** ${p.ingredients}.`);
  if (p.allergens) lines.push(`**Allergens listed:** ${p.allergens}.`);
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

// ---- Main entry point ----

/**
 * Answer a food question from local knowledge. Returns null when the
 * question cannot be answered locally — the caller then falls back to
 * the normal cloud path.
 */
export function answerLocally(question: string, ctx?: { barcodeData?: LocalBarcodeProduct }): string | null {
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
        return foodAnswer(hits[0], "**Allergens:** I can't confirm allergens for a specific packet without the label — check the ingredients list for bold allergen words, or send a photo of the label.");
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
    if (recipe) {
      const lines = [
        `**${recipe.title}**`,
        "",
        `You'll need: ${recipe.needs}.`,
        "",
        ...recipe.steps.map((s, i) => `${i + 1}. ${s}`),
        "",
      ];
      return lines.join("\n");
    }
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
        `**Storing ${e.display.toLowerCase()}:** keep it cool and covered, and use it while it is fresh.`,
        "",
        "In general: keep cooked food in the fridge and eat it within a day or two, keep dry foods sealed and away from damp, and never taste food to check if it is safe.",
        "",
        "When in doubt, throw it out — smell and looks can't prove food is safe.",
        "",
      ].join("\n");
    }
    return [
      "**Storing food, in general:** keep cooked food in the fridge and eat it within a day or two, keep dry foods sealed and away from damp, and follow the date on the pack.",
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
      return `${first}\n\n**And ${foods[1].entry.display}:** ${foods[1].entry.blurb}`;
    }
    return first;
  }

  // A food is named with no clear intent: give its short answer.
  if (foods.length > 0 && !isCooking) {
    return foodAnswer(foods[0].entry, conditionLine(norm) || undefined);
  }

  return null;
}
