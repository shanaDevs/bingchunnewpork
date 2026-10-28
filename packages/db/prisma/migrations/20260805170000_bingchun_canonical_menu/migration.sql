-- Bing Chun canonical menu cleanup (reference migration).
-- Apply the data migration with:
--   npm run migrate:bingchun-menu -w @bingchun/backend
--
-- This SQL documents the slug allow-list used by the TypeScript migrator.
-- Do not run blindly — use the script for safe FK cleanup and store sync.

-- Canonical product slugs (30 items):
-- bobo-milk-tea, brown-sugar-boba-milk-tea, blueberry-bobo-tea, grape-bobo-tea,
-- strawberry-bobo-jasmine-milk-tea, original-milk-tea, lychee-jasmine-milk-tea,
-- fresh-lemonade, jasmine-green-tea, lemon-black-tea, lemon-green-tea,
-- strawberry-lemon-tea, strawberry-mango-lemon-tea, blueberry-milkshake,
-- strawberry-milkshake, chocolate-oreo-milkshake, mulberry-milkshake,
-- strawberry-oreo-milkshake, blueberry-sundae, blueberry-chocolate-sundae,
-- brown-sugar-boba-sundae, chocolate-oreo-sundae, chocolate-biscuit-sundae,
-- mango-sundae, mango-pomelo-sago, oreo-chocolate-sundae, strawberry-sundae,
-- vanilla-ice-cream, chocolate-ice-cream, mix-choco-vanilla-ice-cream

SELECT 1;
