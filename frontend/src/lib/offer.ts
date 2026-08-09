import type {Address} from 'viem'

// A const object rather than a TS enum: this project builds with `erasableSyntaxOnly`,
// and the values must match the Solidity `State` enum exactly.
export const OfferState = {
  Funding: 0,
  Active: 1,
  Repaid: 2,
  Expired: 3,
} as const

export type OfferState = (typeof OfferState)[keyof typeof OfferState]

export type OfferTerms = {
  target: bigint
  cap: bigint
  shareBps: number
  fundingEnds: bigint
  expiresAt: bigint
}

export type OfferSnapshot = {
  address: Address
  state: OfferState
  terms: OfferTerms
  raised: bigint
  totalReceived: bigint
  totalClaimed: bigint
  totalUnits: bigint
  merchant: Address
  splitter: Address
}

/** Shape returned by `WeirOffer.snapshot()`, decoded into something readable. */
export function decodeSnapshot(address: Address, raw: readonly unknown[]): OfferSnapshot {
  const [state, terms, raised, totalReceived, totalClaimed, totalUnits, merchant, splitter] =
    raw as [
      number,
      {target: bigint; cap: bigint; shareBps: number; fundingEnds: bigint; expiresAt: bigint},
      bigint,
      bigint,
      bigint,
      bigint,
      Address,
      Address,
    ]

  return {
    address,
    state: state as OfferState,
    terms: {
      target: terms.target,
      cap: terms.cap,
      shareBps: Number(terms.shareBps),
      fundingEnds: terms.fundingEnds,
      expiresAt: terms.expiresAt,
    },
    raised,
    totalReceived,
    totalClaimed,
    totalUnits,
    merchant,
    splitter,
  }
}

export const STATE_LABEL: Record<OfferState, string> = {
  [OfferState.Funding]: 'Funding',
  [OfferState.Active]: 'Active',
  [OfferState.Repaid]: 'Repaid',
  [OfferState.Expired]: 'Expired',
}

/** Colour intent per state — green only for the two healthy states. */
export const STATE_TONE: Record<OfferState, 'accent' | 'muted' | 'warn'> = {
  [OfferState.Funding]: 'accent',
  [OfferState.Active]: 'accent',
  [OfferState.Repaid]: 'muted',
  [OfferState.Expired]: 'warn',
}

export function isOpenForFunding(offer: OfferSnapshot, now = Date.now() / 1000) {
  return offer.state === OfferState.Funding && Number(offer.terms.fundingEnds) > now
}

/** A funding round that closed short of target — subscribers can withdraw their escrow. */
export function isRefundable(offer: OfferSnapshot, now = Date.now() / 1000) {
  return offer.state === OfferState.Funding && Number(offer.terms.fundingEnds) <= now
}

export function canActivate(offer: OfferSnapshot, now = Date.now() / 1000) {
  return (
    offer.state === OfferState.Funding &&
    offer.raised === offer.terms.target &&
    Number(offer.terms.fundingEnds) >= now
  )
}
