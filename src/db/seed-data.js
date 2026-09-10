/**
 * Catalog seed data.
 *
 * Product imagery points at Unsplash's CDN with explicit crop parameters rather
 * than at Amazon's own media, which blocks hotlinking and would leave every card
 * broken. Titles, bullets and pricing follow real Amazon listing conventions -
 * long keyword-heavy titles, "was" prices, Prime flags - because that shape is
 * what makes the UI read as Amazon.
 */

export const categories = [
  { slug: 'electronics', name: 'Electronics', sort: 1, image: 'photo-1498049794561-7780e7231661' },
  { slug: 'computers', name: 'Computers', sort: 2, image: 'photo-1517336714731-489689fd1ca8' },
  { slug: 'home-kitchen', name: 'Home & Kitchen', sort: 3, image: 'photo-1556909212-d5b604d0c90d' },
  { slug: 'books', name: 'Books', sort: 4, image: 'photo-1512820790803-83ca734da794' },
  { slug: 'fashion', name: 'Fashion', sort: 5, image: 'photo-1445205170230-053b83016050' },
  { slug: 'beauty', name: 'Beauty & Personal Care', sort: 6, image: 'photo-1596462502278-27bfdc403348' },
  { slug: 'toys-games', name: 'Toys & Games', sort: 7, image: 'photo-1558060370-d644479cb6f7' },
  { slug: 'sports-outdoors', name: 'Sports & Outdoors', sort: 8, image: 'photo-1461896836934-ffe607ba8211' },
];

const img = (id, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const products = [
  // ---- Electronics -------------------------------------------------------
  {
    slug: 'echo-dot-5th-gen-smart-speaker-charcoal',
    title: 'Echo Dot (5th Gen, 2024 release) | Smart speaker with bigger vibrant sound, helpful routines and Alexa | Charcoal',
    brand: 'Amazon',
    category: 'electronics',
    price: 4999, listPrice: 5999, stock: 412, rating: 4.7, reviews: 184203,
    prime: true, bestSeller: true,
    images: ['photo-1543512214-318c7553f230', 'photo-1589492477829-5e65395b66cc'],
    bullets: [
      'OUR BEST SOUNDING ECHO DOT YET – Enjoy an improved audio experience compared to any previous Echo Dot with Alexa for clearer vocals, deeper bass and vibrant sound in any room.',
      'YOUR FAVORITE MUSIC AND CONTENT – Play music, audiobooks, and podcasts from Amazon Music, Apple Music, Spotify and others.',
      'ALEXA IS HAPPY TO HELP – Ask Alexa for weather updates, to set timers and alarms, and to answer questions.',
      'CONTROL YOUR SMART HOME – Use your voice to turn on lights, adjust thermostats, and lock doors.',
    ],
    description:
      'Our best sounding Echo Dot yet. Echo Dot is our most popular smart speaker with Alexa. The sleek, compact design delivers crisp vocals and balanced bass for full sound.',
    variants: [
      { name: 'Color', value: 'Charcoal', delta: 0 },
      { name: 'Color', value: 'Glacier White', delta: 0 },
      { name: 'Color', value: 'Deep Sea Blue', delta: 0 },
    ],
  },
  {
    slug: 'fire-tv-stick-4k-max-streaming-device',
    title: 'Fire TV Stick 4K Max streaming device, supports Wi-Fi 6E, free & live TV without cable or satellite',
    brand: 'Amazon',
    category: 'electronics',
    price: 5999, listPrice: 5999, stock: 233, rating: 4.6, reviews: 92841,
    prime: true, bestSeller: true,
    images: ['photo-1593784991095-a205069470b6', 'photo-1522869635100-9f4c5e86aa37'],
    bullets: [
      'Our most powerful streaming stick – 40% more powerful than Fire TV Stick 4K, with faster app starts and more fluid navigation.',
      'Wi-Fi 6E support for smoother 4K streaming on a compatible router.',
      'Endless entertainment – Stream more than 1.5 million movies and TV episodes.',
      'Alexa Voice Remote lets you search and launch content across apps with your voice.',
    ],
    description:
      'Our most powerful streaming stick, with Wi-Fi 6E support for smoother 4K streaming, faster app starts and vivid picture quality with Dolby Vision and HDR10+.',
    variants: [],
  },
  {
    slug: 'sony-wh-1000xm5-wireless-headphones-black',
    title: 'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones with Auto Noise Cancelling Optimizer, Crystal Clear Hands-Free Calling, Black',
    brand: 'Sony',
    category: 'electronics',
    price: 32800, listPrice: 39999, stock: 87, rating: 4.4, reviews: 41287,
    prime: true, bestSeller: false,
    images: ['photo-1505740420928-5e560c06d30e', 'photo-1583394838336-acd977736f90'],
    bullets: [
      'Industry-leading noise cancellation with two processors controlling eight microphones.',
      'Crystal clear hands-free calling with four beamforming microphones and AI-based noise reduction.',
      'Up to 30-hour battery life with quick charging (3 min charge for 3 hours of playback).',
      'Ultra-comfortable, lightweight design with soft-fit leather.',
    ],
    description:
      'Rethink what you know about wireless headphones. The WH-1000XM5 headphones rewrite the rules for distraction-free listening with two processors controlling eight microphones.',
    variants: [
      { name: 'Color', value: 'Black', delta: 0 },
      { name: 'Color', value: 'Silver', delta: 0 },
      { name: 'Color', value: 'Midnight Blue', delta: 1000 },
    ],
  },
  {
    slug: 'apple-airpods-pro-2nd-generation-usb-c',
    title: 'Apple AirPods Pro (2nd Generation) Wireless Earbuds with USB-C Charging, Up to 2X More Active Noise Cancelling, Adaptive Audio, Transparency Mode',
    brand: 'Apple',
    category: 'electronics',
    price: 18900, listPrice: 24900, stock: 156, rating: 4.7, reviews: 128934,
    prime: true, bestSeller: true,
    images: ['photo-1600294037681-c80b4cb5b434', 'photo-1606220945770-b5b6c2c55bf1'],
    bullets: [
      'RICHER AUDIO EXPERIENCE — Up to 2x more Active Noise Cancellation than the previous generation.',
      'ADAPTIVE AUDIO — Dynamically blends Transparency and Active Noise Cancellation.',
      'CUSTOMISABLE FIT — Four pairs of silicone tips (XS, S, M, L).',
      'UP TO 6 HOURS of listening time with Active Noise Cancellation enabled.',
    ],
    description:
      'AirPods Pro feature up to 2x more Active Noise Cancellation, plus Adaptive Audio that dynamically tailors noise control to your environment.',
    variants: [],
  },
  {
    slug: 'samsung-65-inch-crystal-uhd-4k-smart-tv',
    title: 'SAMSUNG 65-Inch Class Crystal UHD DU7200 Series 4K UHD HDR Smart TV with Object Tracking Sound Lite, Motion Xcelerator (2024 Model)',
    brand: 'Samsung',
    category: 'electronics',
    price: 47799, listPrice: 59999, stock: 34, rating: 4.5, reviews: 8342,
    prime: true, bestSeller: false,
    images: ['photo-1593359677879-a4bb92f829d1', 'photo-1461151304267-38535e780c79'],
    bullets: [
      '4K UPSCALING: Crystal Processor 4K transforms content into stunning 4K.',
      'PURCOLOR: Enjoy a vibrant, lifelike picture with millions of shades of color.',
      'MOTION XCELERATOR: Enjoy fluid movement in fast-paced scenes.',
      'SMART TV POWERED BY TIZEN: Stream from Netflix, Prime Video, Disney+ and more.',
    ],
    description:
      'See the difference 4K makes. Crystal UHD delivers a picture with striking clarity and a billion shades of color, in a slim, clean design.',
    variants: [
      { name: 'Size', value: '55 Inch', delta: -10000 },
      { name: 'Size', value: '65 Inch', delta: 0 },
      { name: 'Size', value: '75 Inch', delta: 20000 },
    ],
  },

  // ---- Computers ---------------------------------------------------------
  {
    slug: 'apple-macbook-air-13-m3-chip-8gb-256gb',
    title: 'Apple 2024 MacBook Air 13-inch Laptop with M3 chip: Built for Apple Intelligence, 13.6-inch Liquid Retina Display, 8GB Unified Memory, 256GB SSD Storage',
    brand: 'Apple',
    category: 'computers',
    price: 99900, listPrice: 109900, stock: 62, rating: 4.8, reviews: 3421,
    prime: true, bestSeller: true,
    images: ['photo-1517336714731-489689fd1ca8', 'photo-1541807084-5c52b6b3adef'],
    bullets: [
      'STRIKINGLY THIN AND FAST — MacBook Air with M3 is up to 60% faster than the M1 model.',
      'UP TO 18 HOURS OF BATTERY LIFE — and it is fanless, so it stays silent.',
      'BRILLIANT DISPLAY — 13.6-inch Liquid Retina display with 1 billion colours.',
      'ADVANCED CAMERA AND AUDIO — 1080p FaceTime HD camera, three-mic array.',
    ],
    description:
      'The 13-inch MacBook Air with the M3 chip is up to 60% faster than the M1 model, with a strikingly thin design and all-day battery life.',
    variants: [
      { name: 'Storage', value: '256GB', delta: 0 },
      { name: 'Storage', value: '512GB', delta: 20000 },
      { name: 'Color', value: 'Midnight', delta: 0 },
      { name: 'Color', value: 'Starlight', delta: 0 },
    ],
  },
  {
    slug: 'logitech-mx-master-3s-wireless-mouse',
    title: 'Logitech MX Master 3S - Wireless Performance Mouse with Ultra-fast Scrolling, Ergo, 8K DPI, Track on Glass, Quiet Clicks, USB-C, Bluetooth, Windows, Linux, Chrome',
    brand: 'Logitech',
    category: 'computers',
    price: 9999, listPrice: 11999, stock: 198, rating: 4.6, reviews: 24193,
    prime: true, bestSeller: true,
    images: ['photo-1527864550417-7fd91fc51a46', 'photo-1615663245857-ac93bb7c39e7'],
    bullets: [
      'QUIET CLICKS — 90% less click noise with the same satisfying feel.',
      '8K DPI TRACKING — Track anywhere, even on glass.',
      'MAGSPEED SCROLLING — Scroll 1,000 lines per second, precise enough to stop on a pixel.',
      'FLOW CROSS-COMPUTER — Work across up to three devices seamlessly.',
    ],
    description:
      'Feel every word, every pixel and every click with MX Master 3S — an iconic mouse remastered for quiet clicks and 8K DPI precision.',
    variants: [
      { name: 'Color', value: 'Graphite', delta: 0 },
      { name: 'Color', value: 'Pale Grey', delta: 0 },
    ],
  },
  {
    slug: 'samsung-t7-portable-ssd-1tb-usb-32',
    title: 'SAMSUNG T7 Portable SSD 1TB, USB 3.2 Gen 2 External Solid State Drive, Speeds Up to 1,050MB/s, Shock Resistant, for Gaming, Students and Professionals',
    brand: 'Samsung',
    category: 'computers',
    price: 8999, listPrice: 12999, stock: 143, rating: 4.7, reviews: 56201,
    prime: true, bestSeller: false,
    images: ['photo-1597872200969-2b65d56bd16b', 'photo-1531492746076-161ca9bcad58'],
    bullets: [
      'READ/WRITE SPEEDS UP TO 1,050/1,000 MB/s — up to 9.5x faster than external HDDs.',
      'COMPACT AND DURABLE — Fits in your pocket and withstands drops up to 6 feet.',
      'BROAD COMPATIBILITY — Works with PC, Mac, Android, gaming consoles and more.',
      'PASSWORD PROTECTION — Optional AES 256-bit hardware encryption.',
    ],
    description:
      'Fast, compact and reliable. The T7 delivers speeds up to 1,050 MB/s in a pocket-sized, shock-resistant body.',
    variants: [
      { name: 'Capacity', value: '500GB', delta: -3000 },
      { name: 'Capacity', value: '1TB', delta: 0 },
      { name: 'Capacity', value: '2TB', delta: 8000 },
    ],
  },

  // ---- Home & Kitchen ----------------------------------------------------
  {
    slug: 'instant-pot-duo-7-in-1-electric-pressure-cooker-6qt',
    title: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker, Slow Cooker, Rice Cooker, Steamer, Sauté, Yogurt Maker, Warmer & Sterilizer, Includes App With Over 800 Recipes, Stainless Steel, 6 Quart',
    brand: 'Instant Pot',
    category: 'home-kitchen',
    price: 8995, listPrice: 9995, stock: 276, rating: 4.7, reviews: 213847,
    prime: true, bestSeller: true,
    images: ['photo-1585515320310-259814833e62', 'photo-1556909212-d5b604d0c90d'],
    bullets: [
      '7-IN-1 FUNCTIONALITY — Pressure cook, slow cook, rice cooker, yogurt maker, steamer, sauté pan and food warmer.',
      'COOK FAST OR SLOW — Pressure cook delicious one-pot meals up to 70% faster.',
      'QUICK ONE-TOUCH COOKING — 13 customizable Smart Programs.',
      'EASY TO CLEAN — Fingerprint-resistant, dishwasher-safe stainless steel inner pot.',
    ],
    description:
      'The Instant Pot Duo is the number one selling multi-cooker, combining seven appliances in one to save space and time.',
    variants: [
      { name: 'Size', value: '3 Quart', delta: -2000 },
      { name: 'Size', value: '6 Quart', delta: 0 },
      { name: 'Size', value: '8 Quart', delta: 3000 },
    ],
  },
  {
    slug: 'ninja-air-fryer-af101-4qt',
    title: 'Ninja AF101 Air Fryer that Crisps, Roasts, Reheats, & Dehydrates, for Quick, Easy Meals, 4 Quart Capacity, & High Gloss Finish, Grey',
    brand: 'Ninja',
    category: 'home-kitchen',
    price: 9999, listPrice: 12999, stock: 189, rating: 4.8, reviews: 142093,
    prime: true, bestSeller: true,
    images: ['photo-1626074353765-517a681e40be', 'photo-1585515320310-259814833e62'],
    bullets: [
      'LESS FAT — Air fry with up to 75% less fat than traditional frying methods.',
      'WIDE TEMPERATURE RANGE — 105°F–400°F lets you gently dehydrate or quickly crisp.',
      '4-QUART CERAMIC-COATED BASKET — Fits 2 lbs of french fries, dishwasher safe.',
      'DEHYDRATE — Make chips, dried fruit and veggie crisps.',
    ],
    description:
      'The Ninja Air Fryer cooks with superheated air for crispy results with little to no oil, and cleans up in the dishwasher.',
    variants: [],
  },
  {
    slug: 'stanley-quencher-h2-0-flowstate-tumbler-40oz',
    title: 'STANLEY Quencher H2.0 FlowState Stainless Steel Vacuum Insulated Tumbler with Lid and Straw for Water, Iced Tea or Coffee, Smoothie and More, 40oz',
    brand: 'Stanley',
    category: 'home-kitchen',
    price: 4500, listPrice: 5000, stock: 521, rating: 4.6, reviews: 98412,
    prime: true, bestSeller: true,
    images: ['photo-1602143407151-7111542de6e8', 'photo-1523362628745-0c100150b504'],
    bullets: [
      'DOUBLE WALL VACUUM INSULATION — Keeps drinks cold for 11 hours, iced for 2 days.',
      'FLOWSTATE LID — Three positions: straw opening, drink opening and full cover.',
      'CAR CUP COMPATIBLE — Narrowed base fits most cup holders.',
      'DISHWASHER SAFE — Made from recycled stainless steel.',
    ],
    description:
      'Our Quencher keeps you hydrated all day. Double-wall vacuum insulation, an advanced FlowState lid and a car-cup-friendly base.',
    variants: [
      { name: 'Color', value: 'Charcoal', delta: 0 },
      { name: 'Color', value: 'Rose Quartz', delta: 0 },
      { name: 'Color', value: 'Cream', delta: 0 },
      { name: 'Color', value: 'Fog', delta: 0 },
    ],
  },
  {
    slug: 'lodge-cast-iron-skillet-12-inch-pre-seasoned',
    title: 'Lodge 12 Inch Cast Iron Pre-Seasoned Skillet – Signature Teardrop Handle - Use in the Oven, on the Stove, on the Grill, or Over a Campfire',
    brand: 'Lodge',
    category: 'home-kitchen',
    price: 2990, listPrice: 3995, stock: 318, rating: 4.7, reviews: 89234,
    prime: true, bestSeller: false,
    images: ['photo-1585441695325-21ba1c6de1a9', 'photo-1556910103-1c02745aae4d'],
    bullets: [
      'SEASONED AND READY TO USE — Seasoned with 100% natural vegetable oil.',
      'MADE IN THE USA — Cast iron cookware made in South Pittsburg, Tennessee since 1896.',
      'USE ON ANY HEAT SOURCE — Oven, stove, grill or campfire.',
      'FAMILY-OWNED — Lodge is still owned and run by the Lodge family.',
    ],
    description:
      'A good cast iron skillet is a kitchen essential. Sear, sauté, bake, broil, braise, fry or grill — indoors or out.',
    variants: [],
  },

  // ---- Books -------------------------------------------------------------
  {
    slug: 'atomic-habits-james-clear-hardcover',
    title: 'Atomic Habits: An Easy & Proven Way to Build Good Habits & Break Bad Ones',
    brand: 'Avery',
    category: 'books',
    price: 1198, listPrice: 2700, stock: 843, rating: 4.8, reviews: 168342,
    prime: true, bestSeller: true,
    images: ['photo-1544716278-ca5e3f4abd8c', 'photo-1512820790803-83ca734da794'],
    bullets: [
      '#1 NEW YORK TIMES BESTSELLER — Over 20 million copies sold.',
      'Tiny changes, remarkable results.',
      'A practical framework for improving every day.',
      'Translated into more than 50 languages.',
    ],
    description:
      'No matter your goals, Atomic Habits offers a proven framework for improving every day. James Clear reveals practical strategies for forming good habits and breaking bad ones.',
    variants: [
      { name: 'Format', value: 'Hardcover', delta: 0 },
      { name: 'Format', value: 'Paperback', delta: -400 },
      { name: 'Format', value: 'Audiobook', delta: 500 },
    ],
  },
  {
    slug: 'the-let-them-theory-mel-robbins',
    title: 'The Let Them Theory: A Life-Changing Tool That Millions of People Can\'t Stop Talking About',
    brand: 'Hay House',
    category: 'books',
    price: 1699, listPrice: 2999, stock: 412, rating: 4.6, reviews: 42981,
    prime: true, bestSeller: true,
    images: ['photo-1543002588-bfa74002ed7e', 'photo-1481627834876-b7833e8f5570'],
    bullets: [
      'INSTANT #1 NEW YORK TIMES BESTSELLER.',
      'A simple two-word tool that changes everything.',
      'From the author of The 5 Second Rule.',
      'Stop wasting energy on things you cannot control.',
    ],
    description:
      'If you have ever felt stuck, overwhelmed or frustrated with where you are, the problem is not you. The problem is the power you unknowingly give to other people.',
    variants: [],
  },

  // ---- Fashion -----------------------------------------------------------
  {
    slug: 'levis-mens-505-regular-fit-jeans',
    title: "Levi's Men's 505 Regular Fit Jeans (Also Available in Big & Tall)",
    brand: "Levi's",
    category: 'fashion',
    price: 4200, listPrice: 6950, stock: 267, rating: 4.5, reviews: 73218,
    prime: true, bestSeller: false,
    images: ['photo-1542272604-787c3835535d', 'photo-1475178626620-a4d074967452'],
    bullets: [
      'REGULAR FIT — Sits at the waist, regular through the seat and thigh.',
      'STRAIGHT LEG — Classic straight leg opening.',
      'ZIP FLY — With button closure.',
      '99% Cotton, 1% Elastane for a touch of stretch.',
    ],
    description:
      'The 505 Regular Fit Jean is a classic straight-leg jean that sits at the waist, cut regular through the seat and thigh.',
    variants: [
      { name: 'Size', value: '32W x 32L', delta: 0 },
      { name: 'Size', value: '34W x 32L', delta: 0 },
      { name: 'Size', value: '36W x 34L', delta: 0 },
      { name: 'Color', value: 'Dark Stonewash', delta: 0 },
      { name: 'Color', value: 'Black', delta: 0 },
    ],
  },
  {
    slug: 'hanes-mens-ecosmart-fleece-hoodie',
    title: 'Hanes Men\'s Pullover EcoSmart Hooded Sweatshirt, Midweight Fleece Hoodie',
    brand: 'Hanes',
    category: 'fashion',
    price: 1600, listPrice: 2400, stock: 634, rating: 4.4, reviews: 91203,
    prime: true, bestSeller: true,
    images: ['photo-1556821840-3a63f95609a7', 'photo-1620799140408-edc6dcb6d633'],
    bullets: [
      'MIDWEIGHT FLEECE — 7.8 oz, 50% cotton / 50% polyester.',
      'ECOSMART — Made with recycled polyester from plastic bottles.',
      'NO-PILL — Stays looking new wash after wash.',
      'RIBBED CUFFS AND WAISTBAND — Hold their shape.',
    ],
    description:
      'A midweight fleece hoodie that keeps its shape and colour, made with recycled polyester.',
    variants: [
      { name: 'Size', value: 'Medium', delta: 0 },
      { name: 'Size', value: 'Large', delta: 0 },
      { name: 'Size', value: 'X-Large', delta: 200 },
      { name: 'Color', value: 'Navy', delta: 0 },
      { name: 'Color', value: 'Charcoal Heather', delta: 0 },
    ],
  },

  // ---- Beauty ------------------------------------------------------------
  {
    slug: 'cerave-moisturizing-cream-daily-face-body',
    title: 'CeraVe Moisturizing Cream | Body and Face Moisturizer for Dry Skin | Body Cream with Hyaluronic Acid and Ceramides | Fragrance Free | 19 Ounce',
    brand: 'CeraVe',
    category: 'beauty',
    price: 1648, listPrice: 1999, stock: 729, rating: 4.8, reviews: 187432,
    prime: true, bestSeller: true,
    images: ['photo-1556228720-195a672e8a03', 'photo-1620916566398-39f1143ab7be'],
    bullets: [
      '[ DEVELOPED WITH DERMATOLOGISTS ] Moisturizing cream for normal to dry skin.',
      '[ 3 ESSENTIAL CERAMIDES ] Restore and maintain the skin\'s natural barrier.',
      '[ HYALURONIC ACID ] Helps retain skin\'s natural moisture.',
      '[ GENTLE ON SKIN ] Fragrance free, non-comedogenic and allergy tested.',
    ],
    description:
      'CeraVe Moisturizing Cream is a rich, non-greasy formula that provides 24-hour hydration with three essential ceramides and hyaluronic acid.',
    variants: [
      { name: 'Size', value: '16 oz', delta: -300 },
      { name: 'Size', value: '19 oz', delta: 0 },
    ],
  },

  // ---- Toys & Games ------------------------------------------------------
  {
    slug: 'lego-classic-medium-creative-brick-box-484',
    title: 'LEGO Classic Medium Creative Brick Box 10696 Building Toys for Creative Play, Kids Creative Kit (484 Pieces)',
    brand: 'LEGO',
    category: 'toys-games',
    price: 3499, listPrice: 4499, stock: 231, rating: 4.8, reviews: 63021,
    prime: true, bestSeller: true,
    images: ['photo-1585366119957-e9730b6d0f60', 'photo-1558060370-d644479cb6f7'],
    bullets: [
      '484 PIECES in 35 different colours, including windows, doors, wheels and eyes.',
      'A HANDY STORAGE BOX keeps everything tidy between builds.',
      'INSPIRES OPEN-ENDED CREATIVITY for builders aged 4 and up.',
      'COMPATIBLE with all LEGO construction sets.',
    ],
    description:
      'A collection of 484 LEGO bricks in 35 different colours, with a handy storage box — everything a young builder needs to get started.',
    variants: [],
  },

  // ---- Sports & Outdoors -------------------------------------------------
  {
    slug: 'hydro-flask-wide-mouth-water-bottle-32oz',
    title: 'Hydro Flask Wide Mouth Bottle with Flex Cap, Stainless Steel, Vacuum Insulated, 32 oz',
    brand: 'Hydro Flask',
    category: 'sports-outdoors',
    price: 3995, listPrice: 4995, stock: 187, rating: 4.8, reviews: 47210,
    prime: true, bestSeller: false,
    images: ['photo-1602143407151-7111542de6e8', 'photo-1523362628745-0c100150b504'],
    bullets: [
      'TEMPSHIELD INSULATION keeps drinks cold up to 24 hours, hot up to 12.',
      'PRO-GRADE STAINLESS STEEL — durable and taste-free.',
      'FLEX CAP — Comfortable to carry, easy to open.',
      'DISHWASHER SAFE and BPA-free.',
    ],
    description:
      'Built for the long haul. TempShield double-wall vacuum insulation keeps drinks cold up to 24 hours or hot up to 12.',
    variants: [
      { name: 'Color', value: 'Black', delta: 0 },
      { name: 'Color', value: 'Pacific', delta: 0 },
      { name: 'Color', value: 'Goji', delta: 0 },
    ],
  },
  {
    slug: 'resistance-bands-set-exercise-loop-bands',
    title: 'Resistance Bands Set, Exercise Loop Bands with 5 Levels for Home Workout, Physical Therapy, Yoga, Pilates, Strength Training',
    brand: 'Fit Simplify',
    category: 'sports-outdoors',
    price: 1295, listPrice: 1995, stock: 456, rating: 4.5, reviews: 132094,
    prime: true, bestSeller: true,
    images: ['photo-1517836357463-d25dfeac3438', 'photo-1461896836934-ffe607ba8211'],
    bullets: [
      '5 RESISTANCE LEVELS — from extra light to extra heavy.',
      '100% NATURAL LATEX — durable, odour-free and skin-friendly.',
      'INCLUDES carry bag, instruction guide and workout eBook.',
      'PERFECT FOR home workouts, physical therapy and travel.',
    ],
    description:
      'A set of five loop bands covering a full range of resistance levels — everything you need for strength work at home or on the road.',
    variants: [],
  },
];

export const imageUrl = img;

/** Review snippets, mixed in tone so the product pages do not read as uniformly glowing. */
export const reviewTemplates = [
  { rating: 5, title: 'Exactly what I was looking for', body: 'Arrived a day early and works exactly as described. No complaints at all — would buy again without hesitation.' },
  { rating: 5, title: 'Worth every penny', body: 'I hesitated because of the price but I am glad I went for it. The build quality is noticeably better than the cheaper one I had before.' },
  { rating: 4, title: 'Very good, one small niggle', body: 'Does the job well and looks great. Knocking off a star because the instructions were not especially clear, but I worked it out in a few minutes.' },
  { rating: 5, title: 'Bought a second one', body: 'Liked the first so much I ordered another for my partner. Consistent quality between the two.' },
  { rating: 4, title: 'Good value', body: 'Not perfect but very solid for the money. Has held up to daily use for a couple of months now.' },
  { rating: 3, title: 'Fine, but not amazing', body: 'It does what it says. I think the reviews oversell it slightly — it is decent rather than remarkable.' },
  { rating: 5, title: 'Fast delivery, great product', body: 'Prime delivery was quick and the packaging was secure. Product itself is excellent.' },
  { rating: 2, title: 'Not for me', body: 'Quality seems fine but it did not suit my needs. Returns process was painless at least.' },
  { rating: 5, title: 'Highly recommend', body: 'Have recommended this to several friends already. Genuinely improved my daily routine.' },
  { rating: 4, title: 'Solid purchase', body: 'Happy with it overall. Took a little getting used to but now I use it every day.' },
];

export const reviewAuthors = [
  'Jennifer M.', 'David Chen', 'Sarah Williams', 'Michael T.', 'Amanda Rodriguez',
  'James P.', 'Emily Carter', 'Robert Kim', 'Lisa Thompson', 'Daniel O.',
  'Rachel Green', 'Chris Patel', 'Megan Fisher', 'Anthony B.', 'Nicole Adams',
  'Kevin Nguyen', 'Laura Bennett', 'Steven Clark', 'Hannah Lewis', 'Brian Foster',
];
