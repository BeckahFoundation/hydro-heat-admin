"""Cold-outreach copy for Hydro Heat. Company voice ("we"), short, no prices
(price-on-request policy). Three steps; steps 2-3 are sent as replies in the
same thread. Facts used here were confirmed by the founder on 2026-10-09:
heaters/controls are UL/ETL certified, stock ships from a US warehouse.

Placeholders: {greeting} {company} {catalog}
"""

CATALOG = 'https://www.hydroheatco.com'

# Lead "segment" values (from research + Apollo exports) -> template group.
GROUPS = {
    'builders': {'builder', 'installer', 'contractor', 'outdoor-sauna-maker',
                 'commercial-installer', 'sauna builder'},
    'resellers': {'distributor', 'dealer/retailer', 'sauna brand (d2c)'},
    'operators': {'bathhouse', 'bathhouse chain', 'sauna studio'},
}


def group_for(segment: str) -> str:
    s = (segment or '').strip().lower()
    for g, members in GROUPS.items():
        if s in members:
            return g
    return 'builders'


STEP1 = {
    'builders': {
        'subject': 'Sauna components for {company}',
        'body': (
            '{greeting}\n\n'
            'We\'re Hydro Heat, a US supplier of sauna components for builders and installers. '
            'Everything ships from our US warehouse: UL/ETL-certified heaters and control systems, '
            'sauna doors, benches and backrest frames, lighting, ventilation and sauna rocks.\n\n'
            'If {company} buys components for the saunas you build, we\'d welcome the chance to quote '
            'your next project. Send us a parts list or the room size and we\'ll reply with trade pricing '
            'and availability.\n\n'
            'Our catalog: {catalog}\n'
        ),
    },
    'resellers': {
        'subject': 'US-stocked sauna components for {company}',
        'body': (
            '{greeting}\n\n'
            'We\'re Hydro Heat, a US supplier of sauna components. We stock UL/ETL-certified heaters '
            'and control systems, sauna doors, benches, lighting, ventilation, rocks and accessories '
            'in our US warehouse, and we work with dealers at trade pricing.\n\n'
            'If {company} is looking to add or re-source sauna components, we\'d be glad to send '
            'trade pricing on the items that fit your line.\n\n'
            'Our catalog: {catalog}\n'
        ),
    },
    'operators': {
        'subject': 'Sauna heaters and parts for {company}',
        'body': (
            '{greeting}\n\n'
            'We\'re Hydro Heat, a US supplier of sauna components. We stock UL/ETL-certified heaters '
            'and control systems, replacement doors, benches, lighting, ventilation and sauna rocks '
            'in our US warehouse.\n\n'
            'If {company} is adding rooms or replacing equipment, tell us what you need and we\'ll '
            'reply with trade pricing and availability.\n\n'
            'Our catalog: {catalog}\n'
        ),
    },
}

STEP2 = (
    '{greeting}\n\n'
    'Following up on our note below. To make it easy, these are the items we can quote fastest: '
    'a certified heater with its control system, a sauna door, or benches and backrest frames '
    'built to your room size.\n\n'
    'Is any of those on your list this season? A one-line reply is all we need to send pricing.\n'
)

STEP3 = (
    '{greeting}\n\n'
    'We don\'t want to fill your inbox, so this is our last note. If sauna components aren\'t something '
    '{company} buys, just let us know and we won\'t follow up. If the timing is off, our catalog is '
    'here whenever you need it: {catalog}\n'
)

SIGNATURE = (
    '\nBest regards,\n'
    'Hydro Heat\n'
    'Sauna & heat-therapy components, shipped from the US\n'
    'sales@hydroheatco.com | hydroheatco.com\n'
)

FOOTER = (
    '\n--\n'
    'Hydro Heat, {address}\n'
    'If you\'d rather not hear from us, reply "no" and we won\'t email you again.\n'
)

# Days after the PREVIOUS step before the next one is due.
FOLLOWUP_DAYS = {2: 4, 3: 6}
