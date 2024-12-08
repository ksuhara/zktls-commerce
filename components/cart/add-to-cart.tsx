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

import TransgateConnect from '@zkpass/transgate-js-sdk';
import type { Result } from '@zkpass/transgate-js-sdk/lib/types';
import { ethers, type Eip1193Provider } from 'ethers';
import Web3 from 'web3';

export type TransgateError = {
  message: string;
  code: number;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider | null;
  }
}

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

  console.log(product.reclaim, 'reclaim');
  console.log(product.zkPass, 'zkPass');

  const [requestUrl, setRequestUrl] = useState('');
  const [proof, setProof] = useState<Proof | null>(null);
  const [isProofVerified, setIsProofVerified] = useState(false);

  const appId = 'e23d62ff-adf8-4ed6-9447-381d4dcffae8';
  const schemaId = product.zkPass?.value;

  const getVerificationReq = async () => {
    // Your credentials from the Reclaim Developer Portal
    // Replace these with your actual credentials
    const APP_ID = '0x71f57911C78Ce7D052e6f301F22069E581FD0B29';
    const APP_SECRET = process.env.NEXT_PUBLIC_RECLAIM_APP_SECRET!;
    const PROVIDER_ID = product.reclaim.value;
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

  const requestVerifyMessage = async () => {
    try {
      const connector = new TransgateConnect(appId);
      const isAvailable = await connector.isTransgateAvailable();

      if (isAvailable) {
        const provider = window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null;
        const signer = await provider?.getSigner();
        const recipient = await signer?.getAddress();
        const res = (await connector.launch(schemaId, recipient)) as Result;
        const web3 = new Web3();

        const {
          taskId,
          validatorAddress,
          allocatorSignature,
          validatorSignature,
          uHash,
          publicFieldsHash
        } = res; //return by Transgate

        const taskIdHex = Web3.utils.stringToHex(taskId);
        const schemaIdHex = Web3.utils.stringToHex(schemaId);

        const encodeParams = web3.eth.abi.encodeParameters(
          ['bytes32', 'bytes32', 'address'],
          [taskIdHex, schemaIdHex, validatorAddress]
        );
        const paramsHash = Web3.utils.soliditySha3(encodeParams);

        const signedAllocatorAddress = web3.eth.accounts.recover(paramsHash!, allocatorSignature);

        console.log('Signed Allocator Address:', signedAllocatorAddress);
        if (signedAllocatorAddress !== '0x19a567b3b212a5b35bA0E3B600FbEd5c2eE9083d') {
          alert('Invalid Signature');
          return;
        }

        // Define types and values
        const types = ['bytes32', 'bytes32', 'bytes32', 'bytes32'];
        const values = [taskIdHex, schemaIdHex, uHash, publicFieldsHash];

        //If you add the wallet address as the second parameter when launch the Transgate
        if (recipient) {
          types.push('address');
          values.push(recipient);
        }

        const encodeParams2 = web3.eth.abi.encodeParameters(types, values);

        const paramsHash2 = Web3.utils.soliditySha3(encodeParams2);
        // Recover the address that signed the hash
        const signedValidatorAddress = web3.eth.accounts.recover(paramsHash2!, validatorSignature);
        if (signedValidatorAddress !== validatorAddress) {
          alert('Invalid Signature');
          return;
        } else {
          setIsProofVerified(true);
        }
      } else {
        console.log(
          'Please install zkPass Transgate from https://chromewebstore.google.com/detail/zkpass-transgate/afkoofjocpbclhnldmmaphappihehpma'
        );
      }
    } catch (error) {
      const transgateError = error as TransgateError;
      alert(`Transgate Error: ${transgateError.message}`);
      console.log(transgateError);
    }
  };

  return (
    <>
      {product.reclaim && !isProofVerified ? (
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
        <>
          {product.zkPass && !isProofVerified ? (
            <>
              <p>For those who submit a proof with zkPass can only purchase this item.</p>

              <button
                onClick={requestVerifyMessage}
                className="mb-4 mt-2 w-full rounded bg-lime-400 px-4 py-2 transition-colors hover:bg-lime-500"
              >
                zkPass
              </button>
            </>
          ) : (
            <form
              action={async () => {
                addCartItem(finalVariant, product);
                await actionWithVariant();
              }}
            >
              <SubmitButton
                availableForSale={availableForSale}
                selectedVariantId={selectedVariantId}
              />
              <p aria-live="polite" className="sr-only" role="status">
                {message}
              </p>
            </form>
          )}
        </>
      )}
    </>
  );
}
