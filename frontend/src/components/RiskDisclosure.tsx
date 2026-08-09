import {Panel} from './ui'

/**
 * A design requirement, not a footnote. Weir's structural weakness is that nothing in
 * the code forces a merchant to keep routing revenue through their splitter. A funder
 * who discovers that after subscribing has been misled; a judge who discovers it
 * unstated discounts everything else. So it is stated plainly, everywhere a funder can
 * commit money.
 */
export function RiskDisclosure({compact = false}: {compact?: boolean}) {
  if (compact) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        <span className="text-warn">Repayment depends on continued revenue.</span> Nothing
        forces a merchant to keep routing sales through their splitter. No revenue means no
        repayment.
      </p>
    )
  }

  return (
    <Panel className="border-warn/25 bg-warn/[0.04]">
      <h3 className="text-sm font-semibold text-warn">Understand the risk before funding</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
        <li>
          <span className="text-ink">Repayment is not guaranteed.</span> You are repaid only
          out of revenue that actually flows through this merchant's splitter. If sales stop,
          repayment stops.
        </li>
        <li>
          <span className="text-ink">The merchant can stop routing revenue.</span> No code
          prevents them from telling customers to pay a different address. What discourages it
          is that the splitter is their live payment setup and their repayment record is
          public and permanent.
        </li>
        <li>
          <span className="text-ink">There is no recovery process.</span> If the cap is not
          reached by the expiry date, the offer is marked expired. You keep whatever accrued
          and can claim it; there is no collateral to seize and no legal claim to pursue.
        </li>
        <li>
          <span className="text-ink">This is not a legally enforceable agreement.</span> Weir
          is modeled on revenue-based financing, but these are smart contracts, not
          securities or loan contracts. A production deployment would require
          jurisdiction-specific review.
        </li>
      </ul>
    </Panel>
  )
}
