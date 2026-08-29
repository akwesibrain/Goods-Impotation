-- Catalog photos live in /assets/products/. Price and description stay
-- blank so staff can fill GH₵ and copy from the admin Products tab.

insert into public.products (name, category, image_url, description, price)
select v.name, v.category, v.image_url, null, null
from (values
  ('Plug-in mosquito liquid diffuser', 'Kitchen & Home', '/assets/products/mosquito-diffuser.jpg'),
  ('4-piece food warmer / cooler box set', 'Kitchen & Home', '/assets/products/food-warmer-set.jpg'),
  ('Perfume sample spray set', 'Beauty & Cosmetics', '/assets/products/perfume-sample-set.jpg'),
  ('Home treadmills (folding, walking pad, compact)', 'Electronics', '/assets/products/home-treadmills.jpg'),
  ('Refrigerator cleaner spray', 'Kitchen & Home', '/assets/products/fridge-cleaner-spray.jpg'),
  ('Professional hair dryer styling kit', 'Beauty & Cosmetics', '/assets/products/hair-dryer-kit.jpg'),
  ('Portable charcoal cookstove', 'Kitchen & Home', '/assets/products/charcoal-cookstove.jpg'),
  ('Portable barbecue grill', 'Kitchen & Home', '/assets/products/portable-bbq-grill.jpg'),
  ('Granite cookware pot set', 'Kitchen & Home', '/assets/products/granite-cookware-set.jpg'),
  ('Ceramic serving pot set', 'Kitchen & Home', '/assets/products/ceramic-serving-pots.jpg')
) as v(name, category, image_url)
where not exists (
  select 1 from public.products p where p.name = v.name
);
