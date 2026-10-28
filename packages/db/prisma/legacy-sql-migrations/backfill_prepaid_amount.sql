UPDATE `orders` SET `prepaidAmount` = `total` WHERE `paymentStatus` = 'PAID' AND `prepaidAmount` = 0;
