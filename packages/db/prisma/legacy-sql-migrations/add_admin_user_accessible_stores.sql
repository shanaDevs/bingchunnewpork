-- Implicit many-to-many join for AdminUser.accessibleStores / Store.accessibleByAdmins
-- Prisma relation name: adminuseraccessiblestores
-- Column A = AdminUser (alphabetically first), Column B = Store
--
-- IMPORTANT: On MySQL with lower_case_table_names=0, table names are case-sensitive.
-- Prisma expects exactly `_adminuseraccessiblestores`.
-- If a PascalCase table already exists, rename it first:
--   RENAME TABLE `_AdminUserAccessibleStores` TO `_adminuseraccessiblestores`;

CREATE TABLE IF NOT EXISTS `_adminuseraccessiblestores` (
  `A` VARCHAR(191) NOT NULL,
  `B` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `_adminuseraccessiblestores_AB_unique`(`A`, `B`),
  INDEX `_adminuseraccessiblestores_B_index`(`B`),
  CONSTRAINT `_adminuseraccessiblestores_A_fkey`
    FOREIGN KEY (`A`) REFERENCES `admin_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `_adminuseraccessiblestores_B_fkey`
    FOREIGN KEY (`B`) REFERENCES `stores`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
