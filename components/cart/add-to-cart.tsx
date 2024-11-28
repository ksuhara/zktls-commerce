'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import { Proof, ReclaimProofRequest, verifyProof } from '@reclaimprotocol/js-sdk';
import clsx from 'clsx';
import { addItem } from 'components/cart/actions';
import { useProduct } from 'components/product/product-context';
import { Product, ProductVariant } from 'lib/shopify/types';
import { useActionState, useState } from 'react';
import QRCode from 'react-qr-code';
import { useCart } from './cart-context';

function SubmitButton({
  availableForSale,
  selectedVariantId
}: {
  availableForSale: boolean;
  selectedVariantId: string | undefined;
}) {
  const buttonClasses =
    'relative flex w-full items-center justify-center rounded-full bg-blue-600 p-4 tracking-wide text-white';
  const disabledClasses = 'cursor-not-allowed opacity-60 hover:opacity-60';

  if (!availableForSale) {
    return (
      <button disabled className={clsx(buttonClasses, disabledClasses)}>
        Out Of Stock
      </button>
    );
  }

  console.log(selectedVariantId);
  if (!selectedVariantId) {
    return (
      <button
        aria-label="Please select an option"
        disabled
        className={clsx(buttonClasses, disabledClasses)}
      >
        <div className="absolute left-0 ml-4">
          <PlusIcon className="h-5" />
        </div>
        Add To Cart
      </button>
    );
  }

  return (
    <button
      aria-label="Add to cart"
      className={clsx(buttonClasses, {
        'hover:opacity-90': true
      })}
    >
      <div className="absolute left-0 ml-4">
        <PlusIcon className="h-5" />
      </div>
      Add To Cart
    </button>
  );
}

export function AddToCart({ product }: { product: Product }) {
  const { variants, availableForSale } = product;
  const { addCartItem } = useCart();
  const { state } = useProduct();
  const [message, formAction] = useActionState(addItem, null);

  const variant = variants.find((variant: ProductVariant) =>
    variant.selectedOptions.every((option) => option.value === state[option.name.toLowerCase()])
  );
  const defaultVariantId = variants.length === 1 ? variants[0]?.id : undefined;
  const selectedVariantId = variant?.id || defaultVariantId;
  const actionWithVariant = formAction.bind(null, selectedVariantId);
  const finalVariant = variants.find((variant) => variant.id === selectedVariantId)!;

  console.log(product.metafield, 'metafield');

  const [requestUrl, setRequestUrl] = useState('');
  const [proof, setProof] = useState<Proof | null>(null);
  const [isProofVerified, setIsProofVerified] = useState(false);

  const getVerificationReq = async () => {
    // Your credentials from the Reclaim Developer Portal
    // Replace these with your actual credentials
    const APP_ID = '0x71f57911C78Ce7D052e6f301F22069E581FD0B29';
    const APP_SECRET = process.env.NEXT_PUBLIC_RECLAIM_APP_SECRET!;
    const PROVIDER_ID = product.metafield.value;
    // Initialize the Reclaim SDK with your credentials
    const reclaimProofRequest = await ReclaimProofRequest.init(APP_ID, APP_SECRET, PROVIDER_ID);

    // Generate the verification request URL
    const requestUrl = await reclaimProofRequest.getRequestUrl();
    console.log('Request URL:', requestUrl);
    setRequestUrl(requestUrl);

    // Start listening for proof submissions
    await reclaimProofRequest.startSession({
      onSuccess: async (proof) => {
        setProof(proof as Proof);
        const isVerified = await verifyProof(proof as Proof);
        if (!isVerified) {
          console.error('Proof verification failed');
          return;
        }
        const context = JSON.parse((proof as Proof).claimData.context);
        console.log(context.extractedParameters.followed_by, 'followed_by');
        console.log(context.extractedParameters.following, 'following');
        if (context.extractedParameters.following) {
          setIsProofVerified(true);
        }
      },
      onError: (error: Error) => {
        console.error('Error in proof generation:', error);
      }
    });
  };

  return (
    <>
      {product.metafield && !isProofVerified ? (
        <>
          <p>zkTLSで証明を提出した人のみが購入できます</p>
          {!requestUrl && (
            <button
              onClick={getVerificationReq}
              className="mb-4 w-full rounded bg-purple-500 px-4 py-2 text-white transition-colors hover:bg-purple-600"
            >
              QRコード表示
            </button>
          )}
          {requestUrl && (
            <div className="my-4">
              <QRCode className="w-full" value={requestUrl} size={128} />
              <p className="mt-2">このQRコードを読んで、立ち上がったアプリでXにログインしてね</p>
            </div>
          )}
        </>
      ) : (
        <form
          action={async () => {
            addCartItem(finalVariant, product);
            await actionWithVariant();
          }}
        >
          <SubmitButton availableForSale={availableForSale} selectedVariantId={selectedVariantId} />
          <p aria-live="polite" className="sr-only" role="status">
            {message}
          </p>
        </form>
      )}
    </>
  );
}
