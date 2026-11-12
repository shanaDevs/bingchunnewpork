import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { computeUnitPrice } from '../lib/pricing';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';

const cartItemSchema = z.object({
  productId: z.string(),
  size: z.enum(['REGULAR', 'LARGE']).default('REGULAR'),
  sugarLevel: z.enum(['FIFTY', 'HUNDRED']).optional().nullable(),
  iceLevel: z.enum(['LESS_ICE', 'NORMAL_ICE']).optional().nullable(),
  toppingIds: z.array(z.string()).default([]),
  quantity: z.number().int().min(1).default(1),
});

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, imageUrl: true, basePrice: true } },
            toppings: { include: { topping: true } },
          },
        },
      },
    });

    if (!cart) return success(res, { items: [], subtotal: 0 });

    const subtotal = cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    return success(res, { ...cart, subtotal });
  } catch (err) { next(err); }
}

export async function addToCart(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const data = cartItemSchema.parse(req.body);
    const unitPrice = await computeUnitPrice(data.productId, data.size, data.toppingIds);

    let cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId } });
    }

    const sugarLevel = data.sugarLevel ?? null;
    const iceLevel = data.iceLevel ?? null;

    const existingItems = await prisma.cartItem.findMany({
      where: {
        cartId: cart.id,
        productId: data.productId,
        size: data.size,
        sugarLevel,
        iceLevel,
      },
      include: {
        toppings: true,
      },
    });

    const existing = existingItems.find(item => {
      const itemToppingIds = item.toppings.map(t => t.toppingId).sort();
      const inputToppingIds = [...data.toppingIds].sort();
      if (itemToppingIds.length !== inputToppingIds.length) return false;
      return itemToppingIds.every((id, index) => id === inputToppingIds[index]);
    });

    if (existing) {
      const newQuantity = existing.quantity + data.quantity;
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: data.productId,
          size: data.size as 'REGULAR' | 'LARGE',
          sugarLevel: sugarLevel ?? undefined,
          iceLevel: iceLevel ?? undefined,
          quantity: data.quantity,
          unitPrice,
          toppings: data.toppingIds.length > 0 ? {
            create: data.toppingIds.map((toppingId) => ({ toppingId })),
          } : undefined,
        },
      });
    }

    return success(res, { message: 'Added to cup' }, 201);
  } catch (err) { next(err); }
}

export async function updateCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { quantity } = z.object({ quantity: z.number().int().min(0) }).parse(req.body);

    const item = await prisma.cartItem.findUnique({
      where: { id: req.params.itemId as string },
      include: { cart: true },
    });
    if (!item || item.cart.userId !== userId) throw new AppError('Cart item not found', 404);

    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    }

    return success(res, { message: 'Cart updated' });
  } catch (err) { next(err); }
}

export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    return success(res, { message: 'Cart cleared' });
  } catch (err) { next(err); }
}
