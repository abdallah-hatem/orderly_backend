import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding data...');

  // Clean existing data
  await prisma.orderItemAddon.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItemVariant.deleteMany();
  await prisma.menuItemAddon.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.restaurant.deleteMany();

  const toppings = [
    { name: 'Cheddar Cheese Slice', price: 25 },
    { name: 'Cheddar Cheese Jar (Dip)', price: 45 },
    { name: 'Beef Bacon', price: 55 },
    { name: 'Sautéed Mushrooms', price: 40 },
    { name: 'Jalapeño Slices', price: 20 },
    { name: 'Crispy Onion Rings (2 pcs)', price: 30 },
    { name: 'Mozzarella Stick (1 pc)', price: 35 },
  ];

  const sauces = [
    { name: 'Buffalo Sauce', price: 20 },
    { name: 'BBQ Sauce', price: 20 },
    { name: 'Secret Sauce', price: 25 },
    { name: 'Blue Cheese Sauce', price: 30 },
  ];

  const beefExtras = [
    { name: 'Extra 150g Beef Patty', price: 105 },
    { name: 'Extra 200g Beef Patty', price: 140 },
  ];

  const burgerAddons = [...beefExtras, ...toppings, ...sauces];
  const chickenAddons = [...toppings, ...sauces];

  // Create sample restaurant: Buffalo Burger
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Buffalo Burger',
      description: 'Pure beef burgers, flame-grilled to perfection.',
      categories: {
        create: [
          {
            name: 'Beef Burger Sandwiches',
            items: {
              create: [
                {
                  name: 'Old School',
                  description: 'Pure beef patty, signature Buffalo sauce, and cheddar cheese.',
                  basePrice: 205,
                  variants: { create: [{ name: '200g', priceDiff: 60 }, { name: '400g', priceDiff: 218 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Shiitake Mushroom',
                  description: 'Sautéed mushroom, cheddar cheese, and creamy mayonnaise.',
                  basePrice: 209,
                  variants: { create: [{ name: '200g', priceDiff: 66 }, { name: '400g', priceDiff: 219 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Bacon Mushroom Jack',
                  description: 'Beef bacon, fresh sautéed mushrooms, cheddar cheese, and creamy mayonnaise.',
                  basePrice: 258,
                  variants: { create: [{ name: '200g', priceDiff: 75 }, { name: '400g', priceDiff: 213 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Hitchhiker',
                  description: 'Mozzarella sticks, beef bacon, ketchup, mustard, and Buffalo sauce.',
                  basePrice: 252,
                  variants: { create: [{ name: '200g', priceDiff: 63 }, { name: '400g', priceDiff: 207 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'The Muscular',
                  description: 'Beef burger topped with crispy cheese and creamy Buffalo sauce.',
                  basePrice: 231,
                  variants: { create: [{ name: '200g', priceDiff: 64 }, { name: '400g', priceDiff: 222 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Rastafari',
                  description: 'Cheddar jalapeño bites and creamy Buffalo sauce with a burger patty.',
                  basePrice: 222,
                  variants: { create: [{ name: '200g', priceDiff: 68 }, { name: '400g', priceDiff: 218 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Truffle Beef',
                  description: 'Flame-grilled burger with sautéed mushrooms, crispy onions, and truffle sauce.',
                  basePrice: 217,
                  variants: { create: [{ name: '200g', priceDiff: 65 }, { name: '400g', priceDiff: 223 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'X Urban',
                  description: 'Beef bacon, crispy onion rings, BBQ sauce, and caramelized onions.',
                  basePrice: 253,
                  variants: { create: [{ name: '200g', priceDiff: 72 }, { name: '400g', priceDiff: 206 }] },
                  addons: { create: burgerAddons }
                },
                {
                  name: 'Blue Cheese',
                  description: 'French blue cheese crumbles and signature mayonnaise.',
                  basePrice: 204,
                  variants: { create: [{ name: '200g', priceDiff: 61 }, { name: '400g', priceDiff: 191 }] },
                  addons: { create: burgerAddons }
                },
              ],
            },
          },
          {
            name: 'Chicken Sandwiches',
            items: {
              create: [
                {
                  name: "Cholo's Chicken",
                  description: 'Chicken strips, jalapeños, Buffalo sauce, and melted cheddar.',
                  basePrice: 190,
                  addons: { create: chickenAddons }
                },
                {
                  name: 'Chicken Buster',
                  description: 'Chicken strips with Buffalo sauce and melted cheddar cheese.',
                  basePrice: 191,
                  addons: { create: chickenAddons }
                },
                {
                  name: 'Rastafari Chicken',
                  description: 'Crispy jalapeño bites with chicken strips and creamy Buffalo sauce.',
                  basePrice: 201,
                  addons: { create: chickenAddons }
                },
                {
                  name: 'Chicken Ditch',
                  description: 'Chicken strips, beef bacon, sautéed mushrooms, and secret sauce.',
                  basePrice: 247,
                  addons: { create: chickenAddons }
                },
              ],
            },
          },
          {
            name: 'Appetizers & Sides',
            items: {
              create: [
                { name: 'French Fries', basePrice: 62 },
                { name: 'Cheesy Fries', basePrice: 109 },
                { name: 'Onion Rings', basePrice: 68 },
                { name: 'Chicken Tenders', basePrice: 133 },
                { name: 'Cheddar Jalapeño Bites', basePrice: 125 },
                { name: 'Mozzarella Bites', basePrice: 105 },
                { name: 'Bacon Fries', basePrice: 146 },
                { name: 'Fried Buffalo Wings', basePrice: 113 },
              ],
            },
          },
        ],
      },
    },
  });

  console.log({ restaurant });
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
