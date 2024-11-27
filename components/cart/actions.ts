'use server';

import { TAGS } from 'lib/constants';
import {
  addToCart,
  createCart,
  getCart,
  removeFromCart,
  updateCart,
  updateDiscounts
} from 'lib/shopify';
import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export async function addItem(prevState: any, selectedVariantId: string | undefined) {
  let cartId = (await cookies()).get('cartId')?.value;

  if (!cartId || !selectedVariantId) {
    return 'Error adding item to cart';
  }

  try {
    await addToCart(cartId, [{ merchandiseId: selectedVariantId, quantity: 1 }]);
    revalidateTag(TAGS.cart);
  } catch (e) {
    return 'Error adding item to cart';
  }
}

export async function removeItem(prevState: any, merchandiseId: string) {
  let cartId = (await cookies()).get('cartId')?.value;

  if (!cartId) {
    return 'Missing cart ID';
  }

  try {
    const cart = await getCart(cartId);

    if (!cart) {
      return 'Error fetching cart';
    }

    const lineItem = cart.lines.find((line) => line.merchandise.id === merchandiseId);

    if (lineItem && lineItem.id) {
      await removeFromCart(cartId, [lineItem.id]);
      revalidateTag(TAGS.cart);
    } else {
      return 'Item not found in cart';
    }
  } catch (e) {
    return 'Error removing item from cart';
  }
}

export async function updateItemQuantity(
  prevState: any,
  payload: {
    merchandiseId: string;
    quantity: number;
  }
) {
  let cartId = (await cookies()).get('cartId')?.value;

  if (!cartId) {
    return 'Missing cart ID';
  }

  const { merchandiseId, quantity } = payload;

  try {
    const cart = await getCart(cartId);

    if (!cart) {
      return 'Error fetching cart';
    }

    const lineItem = cart.lines.find((line) => line.merchandise.id === merchandiseId);

    if (lineItem && lineItem.id) {
      if (quantity === 0) {
        await removeFromCart(cartId, [lineItem.id]);
      } else {
        await updateCart(cartId, [
          {
            id: lineItem.id,
            merchandiseId,
            quantity
          }
        ]);
      }
    } else if (quantity > 0) {
      // If the item doesn't exist in the cart and quantity > 0, add it
      await addToCart(cartId, [{ merchandiseId, quantity }]);
    }

    revalidateTag(TAGS.cart);
  } catch (e) {
    console.error(e);
    return 'Error updating item quantity';
  }
}

export async function redirectToCheckout() {
  let cartId = (await cookies()).get('cartId')?.value;

  if (!cartId) {
    return 'Missing cart ID';
  }

  let cart = await getCart(cartId);

  if (!cart) {
    return 'Error fetching cart';
  }

  redirect(cart.checkoutUrl);
}

export async function createCartAndSetCookie() {
  let cart = await createCart();
  (await cookies()).set('cartId', cart.id!);
}

export async function applyDiscount(prevState: any, formData: FormData) {
  //console.log ("Form Data", formData)
  const cartId = (await cookies()).get('cartId')?.value;

  if (!cartId) {
    return 'Missing cart ID';
  }
  const schema = z.object({
    discountCode: z.string().min(1)
  });
  const parse = schema.safeParse({
    discountCode: formData.get('discountCode')
  });

  if (!parse.success) {
    return 'Error applying discount. Discount code required.';
  }

  const data = parse.data;
  let discountCodes = []; // Create a new empty array - actually this array should be the current array of discount codes, but as we only allow one code now, we create an empty array
  discountCodes.push(data.discountCode); // Push the string into the array
  // Ensure the discount codes are unique - this is not really necessary now, because we are only using one code
  const uniqueCodes = discountCodes.filter((value, index, array) => {
    return array.indexOf(value) === index;
  });

  try {
    await updateDiscounts(cartId, uniqueCodes);
    //close cart and have tooltip for c
    revalidateTag(TAGS.cart);
  } catch (e) {
    return 'Error applying discount';
  }
}

export async function removeDiscount(
  prevState: any,
  payload: {
    discount: string;
    discounts: string[];
  }
) {
  //console.log ("payload", payload)
  const cartId = (await cookies()).get('cartId')?.value;

  if (!cartId) {
    return 'Missing cart ID';
  }
  const code = payload?.discount;
  const codes = payload?.discounts ?? []; //the entire array of discounts
  if (!code) {
    return 'Error removing discount. Discount code required.';
  }
  let discountCodes = codes;
  //remove the code from the array and return the array
  let newCodes = discountCodes.filter((item) => item !== code);

  try {
    await updateDiscounts(cartId, newCodes);
    //close cart and have tooltip for c
    revalidateTag(TAGS.cart);
  } catch (e) {
    return 'Error applying discount';
  }
}