-- Catalog photos live in /assets/products/. Price stays blank so staff
-- can type the landed GH₵ quote from the admin Products tab.

insert into public.products (name, category, image_url, description, price)
select v.name, v.category, v.image_url, v.description, null
from (values
  ('Plug-in mosquito liquid diffuser', 'Kitchen & Home', '/assets/products/mosquito-diffuser.jpg', 'Plug-in liquid mosquito killer for Ghana rooms and shops. Refills are easy to restock. The desk quotes landed GH₵ — type the price in admin.'),
  ('4-piece food warmer / cooler box set', 'Kitchen & Home', '/assets/products/food-warmer-set.jpg', 'Insulated food warmer and cooler boxes for home, chop bars, and events. Share set count. The GH₵ price is added in the admin Products tab.'),
  ('Perfume sample spray set', 'Beauty & Cosmetics', '/assets/products/perfume-sample-set.jpg', 'Sample perfume sprays for testers, gift packs, or salon counters. Tell us quantity. Landed GH₵ is typed in admin.'),
  ('Home treadmills (folding, walking pad, compact)', 'Electronics', '/assets/products/home-treadmills.jpg', 'Folding walking-pad treadmills for Ghana homes and small gyms. Confirm 220V / Ghana plug. Staff add the GH₵ price in admin.'),
  ('Refrigerator cleaner spray', 'Kitchen & Home', '/assets/products/fridge-cleaner-spray.jpg', 'Fridge interior cleaner spray for homes and food shops. Share pack size. Quote comes in GH₵ from the admin Products tab.'),
  ('Professional hair dryer styling kit', 'Beauty & Cosmetics', '/assets/products/hair-dryer-kit.jpg', 'Salon hair-dryer kit for Ghana 220V sockets. Share the model you want. Staff type the landed GH₵ price in admin.'),
  ('Portable charcoal cookstove', 'Kitchen & Home', '/assets/products/charcoal-cookstove.jpg', 'Portable charcoal stove for outdoor cooking and small chop businesses. Ask the desk for a landed GH₵ quote, then save it in admin.'),
  ('Portable barbecue grill', 'Kitchen & Home', '/assets/products/portable-bbq-grill.jpg', 'Portable barbecue grill for home, events, and roadside setups. Quantity first — GH₵ is filled in the admin Products tab.'),
  ('Granite cookware pot set', 'Kitchen & Home', '/assets/products/granite-cookware-set.jpg', 'Granite-look cookware set for Ghana kitchens. Share piece count. The desk adds the landed GH₵ price in admin.'),
  ('Ceramic serving pot set', 'Kitchen & Home', '/assets/products/ceramic-serving-pots.jpg', 'Ceramic serving pots for home and chop-bar presentation. Ask the desk for a landed GH₵ quote and type it in admin.')
) as v(name, category, image_url, description)
where not exists (
  select 1 from public.products p where p.name = v.name
);

-- Fill copy on the original ten if they were seeded with a blank description.
-- Do not touch staff-added rows such as Shoe.
update public.products p
set description = v.description
from (values
  ('Plug-in mosquito liquid diffuser', 'Plug-in liquid mosquito killer for Ghana rooms and shops. Refills are easy to restock. The desk quotes landed GH₵ — type the price in admin.'),
  ('4-piece food warmer / cooler box set', 'Insulated food warmer and cooler boxes for home, chop bars, and events. Share set count. The GH₵ price is added in the admin Products tab.'),
  ('Perfume sample spray set', 'Sample perfume sprays for testers, gift packs, or salon counters. Tell us quantity. Landed GH₵ is typed in admin.'),
  ('Home treadmills (folding, walking pad, compact)', 'Folding walking-pad treadmills for Ghana homes and small gyms. Confirm 220V / Ghana plug. Staff add the GH₵ price in admin.'),
  ('Refrigerator cleaner spray', 'Fridge interior cleaner spray for homes and food shops. Share pack size. Quote comes in GH₵ from the admin Products tab.'),
  ('Professional hair dryer styling kit', 'Salon hair-dryer kit for Ghana 220V sockets. Share the model you want. Staff type the landed GH₵ price in admin.'),
  ('Portable charcoal cookstove', 'Portable charcoal stove for outdoor cooking and small chop businesses. Ask the desk for a landed GH₵ quote, then save it in admin.'),
  ('Portable barbecue grill', 'Portable barbecue grill for home, events, and roadside setups. Quantity first — GH₵ is filled in the admin Products tab.'),
  ('Granite cookware pot set', 'Granite-look cookware set for Ghana kitchens. Share piece count. The desk adds the landed GH₵ price in admin.'),
  ('Ceramic serving pot set', 'Ceramic serving pots for home and chop-bar presentation. Ask the desk for a landed GH₵ quote and type it in admin.')
) as v(name, description)
where p.name = v.name
  and (p.description is null or btrim(p.description) = '');
