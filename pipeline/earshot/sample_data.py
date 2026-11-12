"""Synthetic, CFPB-shaped sample data so the site works before the real pipeline has run.

Everything here is invented: the companies are fictional and the complaints are generated
from templates. The shape (columns, product names, XXXX redactions, monthly patterns)
mirrors the real CFPB export, so every downstream step runs unchanged on real data.

Built-in patterns, so the Issue Map has something to find:
  * an industry-wide rise in P2P scam refund denials
  * company-specific spikes (account takeovers, frozen funds, crypto withdrawals, intl delays)
  * a slow decline in identity-verification complaints
"""

from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd

from . import config

COMPANIES = {
    # name: relative size
    "Northwind Pay": 1.6,
    "Lumen Wallet": 1.2,
    "Cobalt Cash": 1.0,
    "Harbor Transfer": 0.8,
    "Tidewater Money": 0.7,
    "Kestrel Pay": 0.6,
    "Brightline Remit": 0.5,
    "Juniper Coin": 0.45,
}

SUB_PRODUCTS = [
    "Mobile or digital wallet",
    "Domestic (US) money transfer",
    "International money transfer",
    "Virtual currency",
]

# Each theme: CFPB-style issue/sub_issue, base monthly rate, sentence pools.
THEMES = {
    "p2p_scam": dict(
        issue="Fraud or scam", sub_issue="Scam", sub_product=0, base=9,
        open=[
            "I was contacted by someone pretending to be from XXXX who said my account was compromised and told me to send {amt} to myself to secure it.",
            "I sent {amt} through the app to a seller on XXXX for a puppy that never existed and the seller blocked me right after.",
            "A person posing as my utility company told me to pay {amt} through the app or my power would be shut off today.",
            "Someone I met online convinced me to send {amt} over several transfers and then disappeared.",
        ],
        mid=[
            "I reported the scam within hours but the company said the payment was authorized by me so they will not refund it.",
            "When I filed a claim they told me peer to peer payments are not covered by purchase protection and closed the case.",
            "Their fraud team said because I entered my own PIN the transfer was valid and nothing could be done.",
            "They denied my refund claim in less than a day without asking me a single question about what happened.",
        ],
        close=[
            "The scammer's account is still active on the platform. I want my money back and I want them to warn customers.",
            "There was no warning in the app before I sent the money even though the recipient account was brand new.",
            "I am asking the CFPB to help me get a real investigation of this scam.",
        ],
    ),
    "frozen_funds": dict(
        issue="Managing an account", sub_issue="Funds held or account frozen", sub_product=0, base=7,
        open=[
            "My account was suddenly limited and {amt} of my funds are being held with no explanation.",
            "Without any notice the company froze my account and is holding {amt} for 180 days.",
            "I logged in and saw my balance of {amt} was on hold and I could not withdraw anything.",
        ],
        mid=[
            "I have sent every document they asked for including my ID, bank statements and invoices but the hold is still there.",
            "Each time I call they tell me the account is under review and they cannot give me a timeline.",
            "They say it is a risk decision and they are not able to tell me why my money is frozen.",
        ],
        close=[
            "This is my money and I need it to pay rent and bills. Holding it for six months is unacceptable.",
            "I run a small business and this hold has stopped me from paying my suppliers.",
            "I want my funds released immediately.",
        ],
    ),
    "account_takeover": dict(
        issue="Fraud or scam", sub_issue="Unauthorized transactions", sub_product=0, base=4,
        open=[
            "Someone logged into my account from another device, changed my email and phone number, and sent {amt} to an account I do not know.",
            "I received a code by text I did not request and minutes later my account was used to make transfers totaling {amt}.",
            "My account was hacked and the password and security settings were changed before I could do anything.",
        ],
        mid=[
            "I was locked out of my own account and the hacker drained my balance and linked bank account.",
            "Two factor authentication did not stop it because they changed the phone number on file first.",
            "Customer service said the transactions came from a recognized device so they consider them authorized.",
        ],
        close=[
            "I never authorized these transactions and I want them reversed and my account secured.",
            "The company should have flagged a new device changing every security setting at once.",
            "I still cannot access my account and nobody has called me back.",
        ],
    ),
    "intl_delay": dict(
        issue="Money was not available when promised", sub_issue="Transfer delayed", sub_product=2, base=4,
        open=[
            "I sent {amt} to my family in XXXX and the app promised delivery within minutes but it has been {days} days.",
            "My international transfer of {amt} has been stuck in processing for {days} days.",
            "I paid an express fee to send {amt} abroad and the money still has not arrived after {days} days.",
        ],
        mid=[
            "The status just says pending and the recipient bank says they have not received anything.",
            "Support keeps telling me to wait another 48 hours and opens a new ticket every time.",
            "They asked for more information about the recipient after I had already sent the money.",
        ],
        close=[
            "My family needed this money for medical bills. I want it delivered or refunded including the fee.",
            "If they cannot deliver it they should return the money instead of holding it.",
            "I want a refund of the transfer fee at a minimum.",
        ],
    ),
    "fx_fees": dict(
        issue="Fees or interest", sub_issue="Unexpected or hidden fees", sub_product=2, base=3,
        open=[
            "The exchange rate I was charged on my transfer of {amt} was much worse than the rate shown before I confirmed.",
            "I was charged a fee I was never told about when sending {amt}.",
            "The app said no fees but the recipient received far less than {amt}.",
        ],
        mid=[
            "The confirmation screen showed one amount and the receipt showed another.",
            "The fee is buried in the exchange rate markup and is not disclosed clearly.",
            "When I asked support they could not explain how the final amount was calculated.",
        ],
        close=[
            "This is deceptive and I want the difference refunded.",
            "Fees should be shown clearly before you send money, not after.",
        ],
    ),
    "crypto_withdrawal": dict(
        issue="Other transaction problem", sub_issue="Virtual currency withdrawal not processed", sub_product=3, base=3,
        open=[
            "I tried to withdraw my bitcoin worth about {amt} to my external wallet and the withdrawal has been pending for {days} days.",
            "My crypto withdrawal is stuck and I cannot sell or move my coins.",
            "The platform disabled withdrawals on my account while I had {amt} in virtual currency.",
        ],
        mid=[
            "The status says processing but the transaction never appears on the blockchain.",
            "Support only replies with automated messages saying the team is looking into it.",
            "They now say I need to complete additional verification even though my account was already verified.",
        ],
        close=[
            "I want access to my assets immediately.",
            "The price has dropped while my funds were stuck and I lost money because of their delay.",
        ],
    ),
    "no_support": dict(
        issue="Managing an account", sub_issue="Problem with customer service", sub_product=0, base=6,
        open=[
            "There is no way to reach a real person at this company.",
            "I have tried for {days} days to get help and only get a chatbot that sends me in circles.",
            "Their phone line says to use the app and the app says to call the phone line.",
        ],
        mid=[
            "I have opened several tickets and every one was closed without an answer.",
            "The chat agent disconnects as soon as I explain the problem.",
            "Emails get a reply saying they are experiencing high volume and to be patient.",
        ],
        close=[
            "A company that holds people's money should have real customer service.",
            "I just want someone to look at my account and fix the issue.",
        ],
    ),
    "kyc_loop": dict(
        issue="Managing an account", sub_issue="Problem with identity verification", sub_product=0, base=5,
        open=[
            "I have uploaded my driver's license and a selfie {n} times and the identity verification keeps failing.",
            "The app keeps asking me to verify my identity and rejects every document I send.",
            "My account is restricted until I verify my identity but the verification system will not accept my ID.",
        ],
        mid=[
            "The photos are clear and my information matches but it still says we could not verify you.",
            "There is no option to talk to a person or send documents another way.",
            "Meanwhile I cannot access my balance of {amt}.",
        ],
        close=[
            "I want a person to manually review my documents.",
            "I am stuck in a loop and cannot use my account.",
        ],
    ),
    "instant_fail_fee": dict(
        issue="Other transaction problem", sub_issue="Fee charged for failed transfer", sub_product=1, base=3,
        open=[
            "I paid the instant transfer fee to move {amt} to my bank but the transfer failed.",
            "My instant transfer did not go through but the fee was still taken.",
            "I was charged for an instant transfer to my debit card that took {days} days to arrive.",
        ],
        mid=[
            "They returned the money to my balance but kept the fee.",
            "Support said the fee is non refundable even though the service was not delivered.",
            "This has happened multiple times and the fee is kept every time.",
        ],
        close=[
            "If the instant transfer is not instant I should not be charged for it.",
            "I want the fees refunded.",
        ],
    ),
    "merchant_dispute": dict(
        issue="Problem with a purchase or transfer", sub_issue="Merchant dispute not resolved", sub_product=0, base=4,
        open=[
            "I paid a merchant {amt} using my wallet and never received the item.",
            "I bought something online for {amt} and the merchant sent a counterfeit product.",
            "I was charged {amt} twice by the same merchant.",
        ],
        mid=[
            "I opened a dispute with tracking and photos but the company sided with the merchant without reviewing my evidence.",
            "The dispute was closed automatically after the merchant uploaded a fake tracking number.",
            "They told me to resolve it with the merchant directly, who does not respond.",
        ],
        close=[
            "I want my money back for a product I never got.",
            "Their buyer protection policy did not protect me at all.",
        ],
    ),
    "account_closed": dict(
        issue="Managing an account", sub_issue="Account closed without notice", sub_product=0, base=3,
        open=[
            "My account was permanently closed today without any warning or reason.",
            "I received an email saying my account is closed and I can no longer use the service.",
            "After years as a customer my account was shut down with no explanation.",
        ],
        mid=[
            "They will not tell me which policy I violated.",
            "My remaining balance of {amt} has not been returned.",
            "My linked bank account is now blocked from opening a new account too.",
        ],
        close=[
            "I want an explanation and my money returned.",
            "Closing accounts without any reason is unfair.",
        ],
    ),
    "wrong_recipient": dict(
        issue="Wrong amount charged or received", sub_issue="Sent to wrong recipient", sub_product=1, base=3,
        open=[
            "I mistyped one digit of a phone number and sent {amt} to the wrong person.",
            "I accidentally sent {amt} to a stranger with the same name as my friend.",
            "The app autofilled the wrong contact and my payment of {amt} went to someone I do not know.",
        ],
        mid=[
            "The company says they cannot reverse it and I have to ask the recipient myself.",
            "The recipient will not respond and the company refuses to contact them.",
            "There was no confirmation showing the recipient's full name before I sent it.",
        ],
        close=[
            "There should be a way to recover a payment sent by mistake.",
            "I want help getting my money back.",
        ],
    ),
}

FILLER = [
    "I have been a customer for {years} years.",
    "This has caused me a lot of stress.",
    "I have screenshots of everything.",
    "My case number is XXXX.",
    "I contacted them on XX/XX/XXXX and again on XX/XX/XXXX.",
    "",
    "",
]


def _monthly_multiplier(theme: str, company: str, t: float, months: int) -> float:
    """Shape over time. t runs 0..1 across the window."""
    m = 1.0 + 0.08 * math.sin(2 * math.pi * t * months / 12)  # mild seasonality
    recent = max(0.0, (t - 0.75) / 0.25)  # 0 until the last quarter of the window, then ramps to 1
    if theme == "p2p_scam":
        m *= 0.8 + 1.1 * t  # industry-wide rise
    if theme == "kyc_loop":
        m *= 1.3 - 0.7 * t  # improving everywhere
    if theme == "account_takeover" and company == "Northwind Pay":
        m *= 1 + 4.0 * recent ** 1.5
    if theme == "frozen_funds" and company == "Cobalt Cash":
        m *= 1.4 + 1.8 * t
    if theme == "crypto_withdrawal":
        m *= 2.5 if company in ("Lumen Wallet", "Juniper Coin") else 0.3
        if company == "Lumen Wallet":
            m *= 1 + 3.5 * recent ** 2
    if theme == "intl_delay":
        m *= 2.0 if company in ("Harbor Transfer", "Brightline Remit") else 0.6
        if company == "Harbor Transfer":
            m *= 1 + 1.5 * recent
    if theme == "no_support" and company == "Tidewater Money":
        m *= 2.2
    if theme == "fx_fees" and company == "Brightline Remit":
        m *= 2.0
    if theme == "instant_fail_fee" and company == "Kestrel Pay":
        m *= 1.0 + 1.6 * t
    return m


def _narrative(rng: np.random.Generator, spec: dict) -> str:
    def fill(s: str) -> str:
        return s.format(
            amt=f"${int(rng.choice([45, 80, 150, 260, 400, 750, 1200, 2500, 4800]) * rng.uniform(0.9, 1.1)):,}",
            days=int(rng.integers(3, 40)),
            n=int(rng.integers(3, 9)),
            years=int(rng.integers(2, 11)),
        )

    parts = [fill(rng.choice(spec["open"]))]
    if rng.random() < 0.5:
        parts.append(fill(rng.choice(FILLER)))
    parts += [fill(s) for s in rng.choice(spec["mid"], size=int(rng.integers(1, 3)), replace=False)]
    parts.append(fill(rng.choice(spec["close"])))
    return " ".join(p for p in parts if p)


def generate(months: int = 36, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    end = date.today().replace(day=1) - timedelta(days=1)  # last day of previous month
    start_month = (pd.Timestamp(end).to_period("M") - (months - 1)).to_timestamp().date()

    rows = []
    cid = 9_000_000
    for mi in range(months):
        month_start = (pd.Timestamp(start_month) + pd.DateOffset(months=mi)).date()
        days_in_month = (pd.Timestamp(month_start) + pd.offsets.MonthEnd(0)).day
        t = mi / (months - 1)
        for company, size in COMPANIES.items():
            for theme, spec in THEMES.items():
                lam = spec["base"] * size * _monthly_multiplier(theme, company, t, months)
                for _ in range(rng.poisson(lam)):
                    cid += int(rng.integers(1, 40))
                    rows.append(
                        dict(
                            complaint_id=cid,
                            date_received=month_start + timedelta(days=int(rng.integers(0, days_in_month))),
                            company=company,
                            product=config.PRODUCT,
                            sub_product=SUB_PRODUCTS[spec["sub_product"]],
                            issue=spec["issue"],
                            sub_issue=spec["sub_issue"],
                            narrative=_narrative(rng, spec),
                            state=str(rng.choice(["CA", "TX", "FL", "NY", "GA", "IL", "PA", "OH", "NC", "NJ"])),
                            submitted_via="Web",
                            company_response=str(rng.choice(
                                ["Closed with explanation", "Closed with monetary relief", "Closed with non-monetary relief"],
                                p=[0.78, 0.12, 0.10],
                            )),
                            timely=bool(rng.random() < 0.97),
                        )
                    )
    df = pd.DataFrame(rows)
    print(f"  generated {len(df):,} sample complaints, {start_month} .. {end}")
    return df
