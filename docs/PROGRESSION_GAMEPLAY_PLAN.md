# FarmRise Tycoon — Complete Progression Gameplay Plan

## Status

This document defines the intended full-game progression beyond the first playable slice. It does
not replace the approved mechanics and core-loop blueprint. The current first playable becomes the
opening stage of this progression.

Implementation snapshot (August 13, 2026): the persistent career, explicit save-v1/v2 migration to
save v3, the complete five-parcel Millbrook estate, hauling, buyer relationships/contracts,
specialization, soil/quality, processors, workers, finance, incidents, seasons, town projects,
multi-shelter livestock assignment with visible per-shelter capacity including Stage-1 sheep/wool production, progression UI,
transition validation, procedural and authored
presentation, and timed autosave are implemented. The current shipped vertical scope ends with the
complete Millbrook estate. Multi-site travel/coarse simulation, machinery and stage-driven lazy
world-asset packs remain later slices and are intentionally not granted by current milestones; see
ADR 0020 and ADR 0026.

Numbers in this document are balance targets for prototyping, not final tuning. Progression should
be validated through playtests before later stages are implemented.

---

## 1. Progression thesis

FarmRise should not use a traditional sequence of disconnected levels.

> The farm is the level.

The player begins with a small plot, limited cash, basic tools and a few understandable needs.
Successful farming creates growth. Growth creates new demands. New demands unlock systems that
interact with everything the player already understands.

The intended long-term loop is:

    Work the farm
          ↓
    Produce a surplus
          ↓
    Reinvest and expand
          ↓
    Create a new bottleneck
          ↓
    Unlock a new capability
          ↓
    Reorganize the farm
          ↓
    Produce at a larger or more specialized scale

Progression is therefore not:

- finish a level;
- receive a larger field;
- repeat the same actions against larger numbers.

Progression is:

- gaining new capabilities;
- creating new dependencies;
- managing more interacting systems;
- shifting from direct labor toward planning and supervision;
- developing a distinct farm identity;
- setting increasingly self-directed goals.

The player's role should evolve through the career:

> farmhand → operator → specialist producer → employer → regional manager → agricultural owner

---

## 2. Relationship to the existing design pillars

Every progression system must strengthen the three approved pillars.

### Hands-On Ownership

Early production requires direct planting, tending, harvesting, hauling and emergency response.
Later automation removes repetition but never removes the player from the world.

At higher progression stages, the player's hands-on responsibilities shift toward:

- premium or fragile crops;
- machinery operation;
- repairs and maintenance;
- urgent deliveries;
- animal handling;
- event response;
- layout redesign;
- inspection of workers and remote sites.

The late game must not become an idle dashboard.

### Meaningful Reinvestment

Money should always compete between at least three valuable uses:

- increase output;
- reduce labor or travel;
- improve resilience;
- add value through processing or market access;
- save toward land or community infrastructure.

No upgrade should be an automatic purchase with no credible alternative.

### Recoverable Disruption

Growth should expose the player to larger and more interconnected risks, but every disruption must
remain:

- warned;
- understandable;
- targeted;
- preventable or mitigable;
- recoverable without losing the entire career.

The player may lose money, output, reputation, time or an opportunity. A single event should not
erase several hours of persistent progress.

---

## 3. The full progression model

Progression operates on three layers.

### Layer A — Persistent farm career

These survive across seasons:

- purchased land;
- placed buildings;
- infrastructure networks;
- unlocked blueprints;
- tools and machinery;
- buyer relationships;
- reputation;
- worker skills;
- town projects;
- discovered regions;
- specialization choices;
- major statistics and achievements.

The persistent farm is the primary expression of player progress.

### Layer B — Seasonal operation

These change between seasons:

- market demand;
- contract mix;
- weather patterns;
- crop suitability;
- water availability;
- temporary worker availability;
- event probabilities;
- town requests;
- seasonal objectives;
- temporary economic modifiers.

A season is a planning and review cadence, not a reset.

### Layer C — Player mastery

The player personally learns:

- how to plan profitable crop combinations;
- how to design short routes;
- how much storage is enough;
- when processing is worthwhile;
- how to protect critical assets;
- how to schedule workers;
- how to diversify against market and weather risk;
- how to redesign a mature farm without stopping production.

Late-game depth should come at least as much from player understanding as from unlocked objects.

---

## 4. Progression clocks

The game should support several nested loops.

| Clock | Typical scope | Player concern |
| --- | --- | --- |
| Immediate action | 2–15 seconds | Move, plant, tend, load, repair, interact |
| Production cycle | 2–8 minutes | Grow, harvest, process and sell one output |
| Operating plan | 10–30 minutes | Complete contracts, manage bottlenecks, survive an event |
| Season | 30–90 minutes | Choose a strategy, invest, meet a milestone, review performance |
| Career stage | Several seasons | Transform the farm's role and unlock a new system layer |
| Long-term sandbox | Open-ended | Pursue scale, beauty, resilience, specialization or community goals |

The opening tutorial season may remain shorter than later seasons. A player should never be forced
to wait for a season boundary before taking an action they have already unlocked.

---

## 5. Progression resources and metrics

FarmRise should avoid a large collection of abstract currencies.

### Spendable resources

#### Cash

The universal operating and investment resource.

Cash pays for:

- seed and feed;
- construction;
- wages;
- maintenance;
- event prevention;
- land;
- machinery;
- community projects;
- loan repayment.

#### Goods

Physical crops, animal products and processed products.

Goods can be:

- sold immediately;
- committed to a contract;
- stored;
- processed;
- used as animal feed;
- contributed to a community project;
- reserved for emergency or seasonal demand.

### Non-spendable progression measures

#### Buyer trust

Represents reliability with an individual buyer. It rises through on-time, complete orders and can
fall through accepted contracts that are abandoned or repeatedly missed.

Buyer trust unlocks larger, more specialized and more profitable orders from that buyer.

#### Regional reputation

Represents the farm's standing across the wider economy. It is not spent.

It rises through:

- successful contracts;
- consistent quality;
- community projects;
- recovery from major events;
- supplying emergencies;
- operating multiple reliable production lines.

Regional reputation unlocks licenses, buyers, regions and civic opportunities.

#### Town prosperity

Represents the health and scale of the nearby settlement.

It grows from:

- reliable food supply;
- employment;
- road access;
- water security;
- community investment;
- successful local businesses.

Town prosperity unlocks workers, services, buyers, infrastructure and visible town growth.

### Operational metrics

These are not currencies and should only appear when the player gains an action that can affect
them.

| Metric | Introduced when | What it measures |
| --- | --- | --- |
| Storage pressure | Starter stage | Goods held versus safe capacity |
| Labor load | Working Farm | Required work versus available player/worker time |
| Delivery throughput | Working Farm | Goods moved through roads, carts and depots |
| Soil health | Specialist Producer | Long-term productivity and disease resistance |
| Product quality | Specialist Producer | Care, freshness and processing quality |
| Water security | Specialist Producer | Demand versus reliable stored and delivered water |
| Workforce capacity | Local Supplier | Worker time, skill and wage commitment |
| Town prosperity | Local Supplier | Community growth and service availability |
| Utility load | Regional Enterprise | Water, fuel, maintenance and processing capacity |
| Network resilience | Agricultural Estate | Ability to absorb regional failures without collapse |

No metric should exist only to punish the player. Every metric must have at least two ways to
improve it.

---

## 6. Milestones instead of traditional levels

Career stages are descriptive milestones, not separate maps that discard the player's work.

Unlocking a milestone makes new capabilities available. It does not grant them for free. The player
must still decide whether and when to purchase or build them.

Prototype milestone structure:

| Stage | Proof of readiness | Major unlock |
| --- | --- | --- |
| Smallholding | Start of the career | Current first-playable tools and systems |
| Homestead | First sale, first reinvestment, first parcel purchased | Persistent seasons and wider farm planning |
| Working Farm | Reliable delivery, positive operating cycle, two developed parcels | Hauling, tools, second buyer and farm reputation |
| Licensed Producer | A specialization facility and a successful processed or quality order | Processing, soil, quality and deeper specialization |
| Local Supplier | Reliable standing contracts, first worker and one town project | Workforce, town growth and scheduled logistics |
| Regional Enterprise | Multiple operating districts and a functioning depot or machinery system | Regions, seasons, machinery and regional trade |
| Agricultural Estate | A resilient multi-site network with major regional standing | Acquisitions, export systems, research and open-ended ambitions |

Milestone requirements should combine multiple forms of success. Pure cash should never be the only
qualification after the opening stage.

---

## 7. Stage 0 — Smallholding

### Player role

Hands-on farmhand learning to keep a tiny farm solvent.

### World

- One 16×16 farm.
- Six starter beds.
- One purchasable neighboring parcel.
- One nearby buyer.
- No town-management layer yet.

### Available production

- Wheat: quick, safe, low-margin income.
- Corn: greater return with meaningful water and feed value.
- Pumpkin: long, profitable and risk-sensitive.
- Chicken: recurring eggs in exchange for feed and shelter.

### Infrastructure

- Barn.
- Irrigation.
- Road.
- Fence.
- Hen purchase.

### Risks

- Drought.
- Fox raid.
- Storage overflow.
- Bankruptcy.

### Player questions

- What should I plant?
- Do I sell now or commit to a contract?
- Do I spend on output, storage, travel, protection or land?
- Do I pay to prevent a warning or accept the loss?

### Milestone

Purchase the neighboring parcel.

### Full-game outcome

Buying the parcel ends the introductory season, not the career. The outcome screen becomes a
season summary and promotion to Homestead.

The parcel, buildings, money and major progress persist.

### Design purpose

Prove that the player wants to begin another production cycle before introducing greater
complexity.

---

## 8. Stage 1 — Homestead and Working Farm

### Player role

Operator responsible for moving goods and organizing a larger physical space.

### New systems

#### Physical hauling

Harvested goods enter the player's carried inventory rather than teleporting directly to global
storage.

The player must:

- carry goods to a barn, loading point, processor or animal feeder;
- decide where storage belongs;
- design short routes;
- avoid harvesting more than can be moved safely;
- use roads for real logistical value.

#### Carry capacity and tools

Early upgrades provide practical capability rather than percentage-only bonuses:

- larger basket;
- watering can with more capacity;
- handcart;
- multi-row seed tool;
- repair kit;
- animal feed sack.

Each tool reduces one type of labor while adding cost, space, maintenance or movement constraints.

#### Second buyer

The second buyer should not be a reskin of the first.

Example contrast:

- Grocer: small quantities, forgiving deadlines, mixed goods.
- Mill: large grain orders, longer deadlines, lower flexibility and better volume pay.

#### Buyer trust

The player can accept a limited number of active contracts. Completing them builds trust and
unlocks stronger opportunities. Missing accepted work has a consequence, while ignoring an
unaccepted order does not.

### New production content

Only add content that creates a distinct decision.

Candidate crops:

- Beans: moderate return and improves or preserves soil when rotated.
- Tomatoes: high labor and high value but poor storage life.
- Hay: low-margin bulk crop that stores well and supports larger livestock operations.

The first addition should be chosen based on which new system is being introduced. If soil is not
yet active, beans should wait. If spoilage is not yet active, tomatoes should wait.

### New infrastructure

- Tool shed: stores and upgrades equipment.
- Loading pad: creates an efficient transfer point for deliveries.
- Upgraded coop: increases flock capacity but raises feed demand.
- Well or water tank upgrade: creates water storage rather than automatic protection.

### Success creates new problems

| Success | New problem |
| --- | --- |
| More land | More walking and hauling |
| More crops | Harvest peaks exceed carry capacity |
| Larger contracts | Storage and delivery timing matter |
| More chickens | Feed demand competes with crop sales |
| Better roads | Expansion becomes attractive, increasing upkeep |

### Milestone

Become a Working Farm by:

- operating at least two developed parcels;
- completing several reliable deliveries;
- maintaining positive operating cash flow;
- responding successfully to a warned disruption;
- purchasing at least one labor or logistics improvement.

Exact counts should be tuned after the first-playable analytics are validated.

---

## 9. Stage 2 — Licensed Producer

### Player role

Specialist producer deciding what kind of farm to become.

### Specialization model

Specializations are soft commitments, not permanent class locks.

The player selects a first license because capital and land are limited. Other licenses may be
earned later, but early investment creates a distinct farm identity.

#### Field and grain operation

Strengths:

- high volume;
- long storage life;
- efficient machinery;
- strong mill and wholesale contracts.

Pressures:

- large land requirement;
- weather exposure;
- low margin without volume or processing;
- soil depletion from repetition.

Key facilities:

- silo;
- grain mill;
- machinery shed;
- large irrigation network.

#### Market garden and orchard

Strengths:

- high value per tile;
- strong restaurant and market demand;
- quality and freshness premiums;
- visual variety.

Pressures:

- high labor;
- short storage life;
- repeated tending;
- seasonal or perennial land commitments.

Key facilities:

- greenhouse;
- cold store;
- preserve shed;
- orchard rows.

#### Livestock operation

Strengths:

- steady recurring output;
- converts crops into higher-value goods;
- manure supports soil and compost systems;
- resilient income outside crop harvest peaks.

Pressures:

- continuous feed and water demand;
- shelter and pasture requirements;
- disease and fencing risk;
- daily labor and welfare obligations.

Implemented and candidate animals:

- Goats: moderate feed and water, milk production, strong fencing need.
- Cows: implemented with high feed, water and space, plus large steady milk output.
- Sheep: implemented after Stage 1 with a long corn-fed wool cycle and nearest-shelter assignment.
- Bees: honey plus crop pollination, with weather sensitivity.

Any further animal should produce a resource tradeoff that is distinct from the existing chicken,
sheep and dairy-cow loops.

### Processing

Processing turns time, capacity and operating cost into higher-value goods.

Example chains:

- Wheat → flour.
- Corn or hay → animal feed.
- Pumpkin or tomato → preserves.
- Milk → cheese.
- Wool → textile goods at a later tier.

Processing decisions:

- sell raw now or wait for greater value;
- reserve goods for feed or process them;
- use storage for raw material or finished goods;
- accept a processing contract before capacity is free;
- operate equipment during high utility demand or delay it.

### Soil health and crop rotation

Soil becomes relevant only after the player can act on it.

The player can improve soil through:

- crop rotation;
- compost;
- fallow periods;
- manure;
- cover crops;
- irrigation management.

Poor soil should reduce yield and disease resistance gradually, not destroy a crop without warning.

### Quality and freshness

Quality reflects:

- tending;
- crop stress;
- animal welfare;
- harvest timing;
- processing condition.

Freshness reflects:

- elapsed time after harvest;
- storage type;
- transport time;
- processing delay.

Quality should unlock premiums and buyer types. It should not invalidate ordinary spot sales.

### Success creates new problems

| Success | New problem |
| --- | --- |
| Processing raises margins | Utilities, maintenance and queues become bottlenecks |
| Specialization improves efficiency | Dependence on one market or weather pattern rises |
| Livestock stabilizes income | Feed, water and daily labor become fixed obligations |
| High-value produce earns more | Spoilage and quality failures become expensive |
| Repeated high-yield cropping | Soil health and disease pressure worsen |

### Milestone

Earn Licensed Producer status by:

- building and operating a specialization facility;
- completing a quality or processed-goods contract;
- maintaining the new resource chain across multiple cycles;
- demonstrating that storage, labor and water can support the operation.

---

## 10. Stage 3 — Local Supplier

### Player role

Employer and community supplier balancing farm growth with local obligations.

### Workforce

Workers are introduced only after the player understands the actions they will delegate.

Workers use task priorities rather than perfect automation.

Example priorities:

- water stressed crops;
- harvest ready high-value crops;
- move goods to cold storage;
- feed animals;
- load active contracts;
- repair damaged infrastructure;
- ignore low-priority plots during an emergency.

Workers have:

- wages;
- working hours;
- travel time;
- skill;
- assigned tools;
- limited ability to improvise.

The player remains better at urgent, specialized and ambiguous work.

### Farm dog

Local Supplier status unlocks the farm dog as shelter-local resilience. A dog costs $100, occupies
one animal-shelter slot, produces no goods and needs no production-cycle feed. Each dog guards only
the shelter it is assigned to and can drive off up to ten foxes during one raid; dogs at other
shelters do not contribute, and multiple dogs at the same shelter stack their protection.

### Automation ladder

| Step | Capability | New cost or limitation |
| --- | --- | --- |
| Better hand tool | Faster individual action | Purchase and maintenance |
| Area tool | Works several adjacent tiles | Stamina, water or seed consumption |
| Infrastructure | Removes a repeated task | Placement, upkeep and capacity |
| Worker | Performs assigned actions | Wage, schedule and travel |
| Machinery | Handles large areas | Fuel, routes, maintenance and storage |
| Site manager | Runs a remote farm by policy | Less precise control and delayed response |

Automation should move the player upward in responsibility, not remove meaningful play.

### Scheduled delivery

Standing contracts introduce recurring commitments.

In the shipped estate, an unlocked supplier may take an ordinary one-off offer or schedule the same
quantity, quality bar and buyer window as a standing delivery. A completed occurrence re-arms for
the next window; a missed occurrence applies the normal trust and money penalty and then re-arms.
The player may end the schedule from the Market panel.

The longer-term design may widen this into player-selected:

- quantity;
- frequency;
- quality promise;
- delivery window;
- contract duration.

Standing contracts pay reliably but reduce flexibility. Market spikes become less valuable when
goods are already committed.

### Town growth

The nearby settlement begins as a crossroads and grows in response to the farm economy.

The player does not manually place every home or simulate every citizen. Instead:

- the player extends roads and agricultural infrastructure;
- the player chooses and funds civic projects;
- housing and local businesses appear when jobs, food, access and water support them;
- town population and prosperity unlock services and buyers.

This is the city-building layer, but it remains connected to the farm.

### Town development stages

| Town stage | Requirement | Farm-facing unlocks |
| --- | --- | --- |
| Crossroads | Starting settlement | Grocer and basic market |
| Hamlet | Reliable food and several jobs | Labor board and second buyer |
| Village | Road, water and community investment | Workshop, school, clinic and skilled workers |
| Market Town | Sustained supply and commerce | Bank, insurance, auction market and cold-chain services |
| Regional Center | Strong transport and regional trade | Rail, research, export office and advanced services |

Population thresholds should be tuned to the visual scale of the world. The important design is
that visible community growth follows the player's economic success.

### Community projects

Projects require cash, goods or operating commitments.

Examples:

- Road improvement: increases delivery speed and town access.
- Water tower: improves town and farm drought resilience.
- Market hall: adds buyers and increases local demand.
- Worker housing: expands the labor pool.
- Workshop: unlocks machinery repair and skilled upgrades.
- Clinic or veterinary service: reduces recovery time from health events.
- School: creates skilled workers and later research access.
- Bridge: opens another district.
- Rail depot: unlocks regional wholesale and export.

Projects must create both a benefit and a new demand. A market hall may increase prices and order
volume, but also raises delivery traffic and reliability expectations.

### Success creates new problems

| Success | New problem |
| --- | --- |
| Hiring workers increases output | Wages and coordination become fixed costs |
| Standing contracts stabilize income | Missed deliveries damage trust |
| Town growth adds buyers | Food, water, roads and jobs must remain reliable |
| Community projects unlock services | Construction and upkeep compete with farm expansion |
| Scheduled transport saves player time | Loading capacity and route planning become bottlenecks |

### Milestone

Become a Local Supplier by:

- maintaining at least one standing contract;
- employing and successfully directing a worker;
- completing a community project;
- supplying a major town request, festival or emergency;
- finishing the season without sacrificing basic farm resilience.

---

## 11. Stage 4 — Regional Enterprise

### Player role

Regional manager coordinating land, machinery, utilities and several markets.

### Regions and biomes

New regions should differ mechanically, not only visually.

Candidate regions:

#### Red-ochre starter region

- familiar crop mix;
- drought exposure;
- moderate land cost;
- established local town.

#### Green pasture region

- strong grazing and dairy potential;
- greater rainfall;
- mud, flooding or disease risk;
- less suitable for drought-tolerant field crops.

#### River or irrigated region

- high crop yield;
- water-control infrastructure;
- flood and contamination risk;
- strong processing and export access.

#### Dry frontier region

- cheap land;
- sparse labor;
- severe transport and water constraints;
- high-value specialist opportunities.

Each region must change at least three of:

- crop suitability;
- water;
- event risk;
- land shape;
- market access;
- labor access;
- transportation;
- seasonal timing.

### Seasons

Seasons affect planning rather than merely recoloring the world.

Seasonal effects may include:

- planting windows;
- crop suitability;
- pasture growth;
- animal feed demand;
- water availability;
- market demand;
- daylight presentation;
- event profile.

The player must always have productive options. A season should redirect activity, not force idle
waiting.

Implemented planting windows keep Wheat, Corn, Pumpkin and Clover available year-round and add
three exclusive seeds per season:

| Season | Exclusive crops |
| --- | --- |
| Spring | Radish, Pea, Strawberry |
| Summer | Sunflower, Tomato, Avocado |
| Autumn | Beetroot, Cranberry, Grape |
| Winter | Carrot, Cabbage, Garlic |

Already-planted crops continue growing across a boundary; only new seed purchasing changes. Spot
sales remain legal year-round, while generated contract pools follow the active season.

### Machinery

Machinery performs area work but depends on farm layout.

Examples:

- tractor and seeder;
- mechanical harvester;
- water tanker;
- feed wagon;
- delivery truck.

Machinery creates:

- fuel cost;
- maintenance;
- turning-radius and road requirements;
- storage needs;
- breakdown risk;
- pressure to create larger, more uniform fields.

The player decides whether greater machine efficiency is worth a less compact or less diverse farm.

### Utility networks

Utilities become planned systems:

- wells;
- tanks;
- reservoirs;
- pumps;
- irrigation channels;
- fuel storage;
- processing capacity;
- waste and compost handling.

Capacity should matter. A reservoir does not make drought irrelevant; it lets the player allocate
scarce stored water.

### Multiple sites

The player may operate:

- one large central farm;
- several specialized satellite farms;
- a production site plus a processing site;
- region-specific operations.

Remote sites require:

- managers;
- policies;
- transport schedules;
- emergency reserves;
- delayed information or response.

### Regional trade

Regional buyers introduce:

- large volume;
- quality grades;
- scheduled pickups;
- fluctuating prices;
- supply commitments across seasons;
- export opportunities.

Regional trade should reward logistics and resilience more than raw acreage alone.

### Success creates new problems

| Success | New problem |
| --- | --- |
| Machinery increases area worked | Fuel, maintenance and field layout matter |
| New regions diversify output | Remote oversight and transport become harder |
| Reservoirs protect production | Water allocation becomes a strategic choice |
| Wholesale orders pay well | A missed shipment has larger consequences |
| Multiple sites reduce local risk | Network failures can interrupt the whole chain |

### Milestone

Become a Regional Enterprise by:

- operating successfully in more than one district or biome;
- maintaining a machinery or utility network;
- completing a major regional contract;
- connecting the farm to a depot, bridge or equivalent transport project;
- recovering from a regional-scale disruption without career collapse.

---

## 12. Stage 5 — Agricultural Estate

### Player role

Agricultural owner shaping a network of farms, towns, industries and trade routes.

### Major capabilities

- Acquire or lease competing farms.
- Establish region-specific managers and policies.
- Build an export brand.
- Operate advanced processing.
- Fund agricultural research.
- Develop seed varieties or animal breeds.
- Coordinate rail, depot and warehouse networks.
- Invest in watershed, conservation or regional resilience.
- Choose long-term economic and community policy.

### Estate strategies

The player should be able to pursue several valid endgame identities.

#### High-volume producer

- large mechanized fields;
- wholesale and export;
- high utility and market exposure;
- strong logistics challenge.

#### Premium food network

- quality produce;
- animal goods;
- processing and branding;
- restaurant, tourism and specialty markets.

#### Resilient diversified estate

- many smaller production lines;
- strong reserves;
- environmental stability;
- lower peak profit but strong disaster recovery.

#### Community cooperative

- worker ownership or profit sharing;
- town investment;
- local food security;
- lower extraction and stronger labor availability.

#### Regenerative operation

- soil, water and biodiversity goals;
- reduced chemical or resource intensity;
- slower expansion with long-term yield stability.

No strategy should be declared the universally correct one.

### Late-game problems

- regional drought;
- flood or contamination;
- transport interruption;
- recession or price collapse;
- labor shortage;
- disease crossing several sites;
- utility failure;
- over-specialization;
- environmental degradation;
- community opposition to unchecked expansion.

Every late-game event must still be warned and recoverable. The challenge comes from competing
priorities and network effects, not surprise destruction.

### Endgame

Reaching Agricultural Estate completes the authored career arc and unlocks an open-ended sandbox.

The player may continue toward self-defined ambitions:

- supply the entire region with staple food;
- reach a target estate value;
- operate without debt;
- eliminate preventable crop loss;
- maintain full employment;
- make the town a regional center;
- build a zero-waste processing chain;
- recover from a major disaster;
- complete every community project;
- create the most compact or beautiful productive farm;
- specialize in one premium product;
- operate across every biome.

An optional legacy mode may let the player begin a new region with one inherited blueprint,
relationship or cosmetic. It must not be the only way to continue progressing.

---

## 13. The five permanent investment tracks

Every major surplus should create competition between these tracks.

| Track | Early examples | Midgame examples | Late examples |
| --- | --- | --- | --- |
| Production | More plots, hen | Greenhouse, livestock, processing | Regional specialization, advanced facilities |
| Labor and logistics | Roads, basket, handcart | Workers, wagon, loading depot | Machinery, managers, rail logistics |
| Resilience | Fence, irrigation, barn | Reservoir, cold store, veterinary care | Regional reserves, insurance, watershed projects |
| Market and value | Spot sale, simple contract | Processing, standing buyers, quality | Branding, wholesale, export |
| Expansion and community | First parcel | Town projects, bridge, worker housing | Satellite farms, acquisitions, regional infrastructure |

The player should rarely be able to maximize all five at the same time. The farm's identity emerges
from repeated investment choices.

---

## 14. Interconnected production chains

New systems must interact with existing systems rather than forming isolated minigames.

Example network:

    Grain ───────────────→ sell raw
      │
      ├──→ mill ─────────→ flour ──→ bakery contracts
      │
      └──→ feed ─────────→ animals ─→ eggs / milk / wool
                                      │
                                      ├──→ sell raw
                                      └──→ process into premium goods

Supporting loops:

- Animals produce manure.
- Manure becomes compost.
- Compost improves soil.
- Better soil increases crop quality and resilience.
- Higher quality unlocks demanding buyers.
- Demanding buyers finance better logistics.
- Better logistics makes distant regions viable.

The system should reward circular planning without requiring one exact optimal chain.

---

## 15. Success must create new problems

Every major unlock must be reviewed against this table.

| Player success | Benefit | New pressure |
| --- | --- | --- |
| Buys land | More production space | More travel, labor and infrastructure |
| Builds storage | Can hold goods | Ties up capital and encourages larger harvests |
| Adds irrigation | More reliable crops | Water supply and upkeep become important |
| Adds animals | Recurring goods | Feed, water, shelter and welfare obligations |
| Adds processing | Higher margins | Utility, maintenance, queues and storage complexity |
| Hires workers | More work completed | Wages, tools, routes and priorities |
| Adds machinery | High throughput | Fuel, repairs and field-layout constraints |
| Gains buyer trust | Better contracts | Larger commitments and reputational risk |
| Grows the town | More services and demand | Roads, water, jobs and community expectations |
| Opens a region | Diversification | Remote management and transport |
| Specializes | Efficiency and identity | Greater exposure to one risk or market |
| Diversifies | Resilience | Management and logistics complexity |

An unlock that only makes the player stronger without producing a new decision is incomplete.

---

## 16. Farm and town demands over time

Player concerns should evolve naturally.

### Opening

- Can I afford seed?
- What grows quickly?
- Where do I sell?
- Can I avoid bankruptcy?

### Working Farm

- How do I move everything?
- Is my barn in the right place?
- Can I complete this delivery?
- Should I spend on tools or land?

### Licensed Producer

- Should I sell raw or process?
- Is specialization making me fragile?
- Is my soil declining?
- Can I keep quality high?

### Local Supplier

- Can workers reach the right tasks?
- Can I afford wages during a bad season?
- Which town project unlocks the service I need?
- How much production should be committed to standing orders?

### Regional Enterprise

- Which region should produce which good?
- Is my transport network the real bottleneck?
- How much water or reserve capacity is enough?
- Can one site fail without stopping the whole chain?

### Agricultural Estate

- What kind of operation am I building?
- How much efficiency am I willing to trade for resilience?
- Should the next surplus serve expansion, workers, the community or the environment?
- Can the network continue operating under a regional crisis?

---

## 17. Warned event progression

Events should progress from local and tactical to systemic and strategic.

### Stage 0 events

- Drought.
- Fox raid.

Responses:

- pay;
- physically respond;
- accept reduced output.

### Working Farm events

- Crop disease.
- Fence breach.
- Water-pump failure.
- Urgent buyer request.

Responses introduce:

- quarantine;
- targeted repair;
- temporary reprioritization;
- sacrifice of a lower-value commitment.

### Licensed Producer events

- Processing breakdown.
- Cold-storage failure.
- Feed shortage.
- Contamination warning.

Responses introduce:

- rerouting goods;
- emergency maintenance;
- stopping one production line to protect another;
- selling at a loss before spoilage.

### Local Supplier events

- Worker shortage.
- Festival demand surge.
- Town water restriction.
- Road closure.

Responses introduce:

- wage incentives;
- schedule changes;
- community tradeoffs;
- alternate delivery routes.

### Regional events

- Flood.
- Regional drought.
- Market recession.
- Disease crossing sites.
- Rail or depot outage.

Responses introduce:

- reserves;
- insurance;
- network rerouting;
- diversification;
- temporary regional policy.

### Event contract

Every event must provide:

1. A clear warning.
2. Named assets, routes, contracts or regions at risk.
3. At least three response categories:
   - spend;
   - act;
   - accept or redirect the loss.
4. Visible consequences.
5. A recovery path.

Paying should never remain the universally optimal event response.

---

## 18. Economy and anti-snowball rules

Expansion should be rewarding without making the economy trivial.

### Operating costs

Larger farms add:

- wages;
- feed;
- seed;
- maintenance;
- utilities;
- fuel;
- insurance;
- transport;
- land costs.

Operating costs create planning pressure but should not become constant invisible drains. The season
plan and projected commitments must make major costs legible.

### Capital versus operating money

The game should use one cash balance, but clearly show:

- committed operating cost;
- available spending cash;
- expected contract income;
- debt obligations.

This preserves one currency while helping the player avoid accidental insolvency.

### Loans

Loans become available through town development.

Loans allow:

- machinery investment;
- land purchase;
- emergency recovery;
- processing construction.

Loans create:

- interest;
- scheduled payment;
- less flexibility during a bad season.

They should accelerate a plan, not be required for ordinary survival.

### Insurance

Insurance is an optional resilience investment:

- crop insurance;
- livestock insurance;
- machinery coverage;
- delivery interruption coverage.

Insurance returns part of a loss after an eligible event. It does not prevent the event or replace
active response.

### Market behavior

Market complexity should grow in layers:

1. Fixed spot price.
2. Premium contracts.
3. Multiple buyers.
4. Quality and freshness premiums.
5. Standing contracts.
6. Seasonal demand.
7. Regional price differences.
8. Market cycles and export exposure.

Do not introduce full price volatility before the player has meaningful alternatives.

---

## 19. Failure, decline and recovery

The campaign should distinguish a bad season from career failure.

### Soft failures

- missed contract;
- spoiled goods;
- damaged crop;
- animal loss;
- temporary reputation decline;
- debt;
- delayed expansion;
- asset downtime.

These create stories and new decisions.

### Recovery tools

- low-risk recovery contracts;
- asset sale;
- emergency loan;
- town relief;
- insurance payout;
- temporary lease of unused land;
- reduced worker hours;
- crop switch;
- stored reserves;
- community assistance earned through prior investment.

### Bankruptcy

Bankruptcy may remain a true failure state in:

- the opening tutorial run;
- challenge scenarios;
- optional Tycoon difficulty.

In the persistent standard campaign, insolvency should trigger restructuring before deletion:

- sell or mothball assets;
- give up leased land;
- accept a supervised recovery loan;
- return temporarily to a smaller operation.

The player should be able to lose scale without losing the entire history of the farm.

### Negative spirals

Negative feedback loops are desirable only when visible and interruptible.

Example:

    Missed deliveries
          ↓
    Lower buyer trust
          ↓
    Fewer premium contracts
          ↓
    Less cash for wages
          ↓
    Lower production capacity

The player can interrupt this loop through spot sales, reduced commitments, asset sales, recovery
contracts or community support.

---

## 20. Player-defined goals and sandbox play

Designer-authored goals should gradually give way to player-authored ambitions.

### Early authored goals

- Harvest and sell.
- Complete a contract.
- Buy the first parcel.
- Build a functional road and storage layout.
- Earn the first specialization license.

### Midgame strategic goals

- Build a profitable processing chain.
- Become the preferred supplier for a buyer.
- Grow the nearby town.
- Operate with a worker team.
- Survive a difficult season without debt.
- Develop a second region.

### Late sandbox goals

- Build the largest estate.
- Create the highest-value compact farm.
- Eliminate preventable losses.
- Maintain maximum buyer reliability.
- Supply the entire region with one category of goods.
- Build a highly diversified disaster-resistant network.
- Develop every town service.
- Reach water or waste neutrality.
- Create a fully local circular production chain.
- Recover from the hardest regional disaster.

The game should support these goals with metrics, summaries and visible world changes without
declaring one of them the only correct victory.

---

## 21. Progressive disclosure and teaching

The current onboarding model should extend into the full career.

### Rules

- Introduce one new system at a time.
- Unlock a system only when the player can act on it immediately.
- Use a real task, not an explanatory modal.
- Show locked future options with a clear requirement.
- Defer world-triggered teaching until the relevant situation occurs.
- Skip teaching when the player has already demonstrated mastery.
- Reveal a metric only when the player gains an action that affects it.
- Give every major system a safe first use.

### Example

Processing should not appear as a full factory menu during the first harvest.

Instead:

1. The player earns a grain license.
2. A buyer requests flour.
3. The mill becomes visible as a locked or newly available building.
4. The player builds it.
5. The first order teaches loading, processing and collection.
6. Only after successful use do queue and maintenance controls appear.

### Unlock presentation

Major unlocks should have world-space consequences:

- the new parcel gate opens;
- the delivery wagon arrives;
- a worker moves into town;
- the mill begins turning;
- a market hall is constructed;
- a bridge opens;
- a train reaches the depot;
- a new region appears on the map.

Progress must be visible outside menus.

---

## 22. Pacing targets

These are prototype targets and must be adjusted through observation.

| Career period | Unlock rhythm | Design intent |
| --- | --- | --- |
| First 20 minutes | Frequent guidance and small capability unlocks | Establish the complete base loop |
| 20–90 minutes | One meaningful unlock every 15–30 minutes | Solve hauling, storage and buyer growth |
| 1.5–5 hours | One major system or specialization per season | Establish farm identity |
| 5–15 hours | Town, workers and standing logistics | Shift from laborer to employer |
| 15–30 hours | Regions, machinery and utilities | Shift from farm optimization to network planning |
| 30+ hours | Open-ended estate goals | Player-directed mastery |

Pacing safeguards:

- Do not unlock two large systems in the same production cycle.
- Allow at least one safe cycle with a new system before adding its first serious disruption.
- A newly unlocked capability should normally become affordable within one or two successful
  operating plans, unless it is explicitly a long-term landmark.
- Avoid long stretches where the only progress is filling a money meter.
- A new milestone should change what the player can decide, not only increase capacity.

---

## 23. Difficulty and play styles

Progression should work across several levels of economic pressure.

### Relaxed

- generous contract deadlines;
- slower spoilage;
- fewer compound events;
- forgiving debt;
- strong recovery options.

### Standard

- intended balance;
- meaningful upkeep;
- warned events;
- moderate market variation;
- restructuring before career loss.

### Tycoon

- tighter margins;
- stronger maintenance and wage pressure;
- stricter contract reliability;
- more interconnected events;
- possible career bankruptcy.

Difficulty should change pressure and forgiveness, not hide information or make outcomes arbitrary.

Optional scenarios may impose specific constraints:

- water-limited region;
- livestock-only recovery farm;
- rebuild after flood;
- supply a rapidly growing town;
- operate without loans;
- meet environmental targets;
- restore an abandoned rail farm.

---

## 24. Content acceptance rules

A proposed crop, animal, building, buyer, region or event should be rejected unless it answers all
of the following:

1. What new decision does it create?
2. Which existing system does it interact with?
3. What new benefit does it provide?
4. What new pressure or obligation does it create?
5. At what progression stage can the player understand it?
6. How is it taught through play?
7. How is it visible in the world?
8. What is the recovery path if it contributes to failure?

Examples of weak additions:

- a crop with the same timing and economics as wheat but a different color;
- a barn upgrade that only adds 10 percent capacity;
- a buyer with the same orders and deadlines as the grocer;
- a region with different ground color but identical rules;
- an event solved by paying the same prevention fee as every other event.

Examples of strong additions:

- a perennial crop that commits land across seasons;
- cold storage that preserves goods but consumes utility capacity;
- a buyer who pays for quality but rejects late deliveries;
- a floodplain region with high yield and water-control risk;
- a contamination event requiring quarantine, rerouting and buyer communication.

---

## 25. Analytics and playtest questions

### Base-loop validation

- How many production cycles begin voluntarily after the first sale?
- How many players encounter and understand a warned event?
- Is spot versus contract a real choice?
- Is one starter investment dominant?
- Is the first parcel goal understood?

### Progression validation

- How long passes between meaningful unlocks?
- Do players purchase a newly unlocked capability or ignore it?
- Where do players stop progressing?
- Which specialization paths are chosen?
- Do players diversify later or remain specialized?
- Does every new system change farm layout or operating plans?

### Economy validation

- What percentage of cash is operating expense versus investment?
- Are players losing because of understandable commitments or hidden drains?
- How often do loans enable growth versus merely prevent collapse?
- Are processing margins worth their labor and capacity cost?
- Do standing contracts feel reliable or restrictive?

### Automation validation

- Which actions are delegated first?
- Does automation reduce repetition without removing player involvement?
- Are worker priorities understandable?
- Do machinery and workers create new layout decisions?

### Resilience validation

- How many different responses are used for each event?
- Is paying always the dominant response?
- Can players recover from a bad season?
- Which failures create frustration rather than a new plan?
- Can a mature network absorb one site failure?

### Town and sandbox validation

- Does visible town growth feel caused by the player?
- Which community projects are chosen first?
- Does one project dominate?
- What self-defined goals do late players adopt?
- Do players continue after the authored career milestone?

---

## 26. Recommended development sequence

This is a design order, not a coding plan.

### Progression Slice A — Beyond the first parcel

Purpose: prove the game can support a persistent second chapter.

Include:

- persistent farm across season summary;
- second parcel as retained progress;
- physical hauling;
- carry capacity and handcart;
- second buyer;
- buyer trust;
- one logistics-focused event or disruption;
- one larger milestone contract.

Do not yet add:

- workers;
- seasons;
- several processing chains;
- full town growth;
- multiple regions.

### Progression Slice B — Farm identity

Purpose: prove specialization and value-added production.

Include:

- one specialization choice;
- one processing chain;
- soil or quality, whichever directly supports the chosen chain;
- one new animal or crop with a distinct resource tradeoff;
- a specialist buyer;
- first recovery loan or insurance option.

### Progression Slice C — Local supplier

Purpose: prove delegation and community growth.

Include:

- first worker;
- task priorities;
- scheduled delivery;
- visible town growth;
- two community projects;
- one compound but recoverable local event.

### Progression Slice D — Regional enterprise

Purpose: prove network-scale planning.

Include:

- second biome or district;
- seasonal suitability;
- one machine;
- one utility network;
- regional depot;
- site manager;
- regional event.

### Progression Slice E — Agricultural estate

Purpose: complete the authored career and open the sandbox.

Include:

- acquisitions or additional sites;
- advanced processing or export;
- research or breeding;
- regional policy and resilience;
- multiple endgame ambitions;
- optional scenario and legacy structure.

Each slice should be playtested before the next one broadens the system count.

---

## 27. Design gates before implementation

The following decisions must be resolved before full progression work begins:

1. Confirm that the persistent farm is the standard campaign and self-contained runs become
   scenarios or challenge mode.
2. Confirm whether a season is a fixed calendar duration, a milestone checkpoint or a hybrid.
3. Select the first post-parcel bottleneck. The recommendation is hauling and logistics.
4. Select the first added buyer and ensure its behavior differs from the grocer.
5. Select the first specialization and processing chain for prototyping.
6. Decide how much town placement the player directly controls.
7. Decide whether standard-campaign bankruptcy restructures the farm or ends the career.
8. Establish one current-state source of truth so stale implementation notes do not drive design.

---

## 28. Progression quality checklist

A progression stage is ready only if:

- the player gains at least one genuinely new capability;
- that capability interacts with at least two existing systems;
- success creates a visible new bottleneck;
- the player has multiple valid responses;
- the farm or town visibly changes;
- the new system has a just-in-time teaching path;
- there is a safe first use;
- failure is legible and recoverable;
- no single investment is an obvious universal choice;
- the stage advances the player's role, not only their balance;
- the player can remain at the current scale temporarily without being punished;
- the next milestone emerges from operating the farm rather than filling an arbitrary XP bar.

---

## 29. Final progression summary

FarmRise begins as a direct farming game:

> plant → tend → harvest → sell → reinvest

It grows into an operating game:

> plan → route → process → contract → protect → expand

It develops into a community game:

> employ → supply → build services → grow the town → unlock opportunity

It matures into a regional strategy game:

> specialize → connect regions → manage utilities → diversify risk → coordinate trade

It ends as an open agricultural sandbox:

> choose what kind of estate, economy and community to build

The core principle remains constant:

> Every success should create a new opportunity and a new problem worth solving.

---

## 30. System-wide implementation impact

> Sections 30–50 preserve the pre-expansion implementation audit and delivery rationale. References
> to the “current” first-playable architecture in those sections describe the baseline that was
> audited, not the August 2026 implementation snapshot at the top of this document. The snapshot and
> ADRs are authoritative for what is implemented or intentionally deferred now.

The progression plan cannot be delivered by adding definitions to the existing crop and building
tables alone. The current architecture is a strong first-playable foundation, but several systems
are intentionally sized around:

- one farm;
- one fixed 16×16 grid;
- six permanent plot locations;
- three crops;
- one animal species;
- four placeable building kinds;
- one buyer;
- one active event at a time;
- one neighboring-parcel outcome;
- one JSON save document.

The full progression requires changes across the shared rules, game simulation, rendering, UI,
assets, save lifecycle, backend authority, analytics and testing.

This section describes what can be reused, what must be extended and what should be replaced before
later progression stages are attempted.

---

## 31. Pre-expansion system readiness assessment

| Current system | Reuse level | What it already provides | What progression requires |
| --- | --- | --- | --- |
| Fixed-step game loop | High | Deterministic 60 Hz simulation and variable rendering | Add slower economic substeps so large farms do not evaluate every slow system 60 times per second |
| Shared domain and rules | High | Crops, animals, buildings, storage, orders and outcomes | Split progression into additional focused rule domains |
| FarmWorld | Medium | One farm's plots, buildings, animals, inventory and balance | Refactor into a facade over smaller simulation models before adding workers, logistics, processing and utilities |
| FarmCommands | High | One function per player intent with Result failures | Add new command modules by responsibility rather than growing one file indefinitely |
| TileGrid and GridPhysics | Medium-high | Deterministic movement, flags, collision and road cost | Add parcel ownership, terrain layers, utilities, larger-site strategy and vehicle/path classes |
| LevelDefinition | Medium | Declarative starter layout | Add parcel, region, terrain, entry point and site definitions shared with validation |
| PlotView | Medium | Efficient instancing for fixed plot locations and four crop stages | Support dynamic plots or fields, new crops, capacity changes and stage-specific asset loading |
| StructureView | Low-medium at scale | Placement preview and a few distinct structures | Instance repeated roads/fences, support rotation, upgrades, processors, utility state and many buildings |
| FarmView | Medium | Ground, scenery, weather tint, animals and events for one site | Add biome themes, scale-aware dressing, culling, region packs and more actor categories |
| Player interaction | Medium-high | Contextual E action for plant, tend and harvest | Add transfer, load, repair, feed, operate and inspect without assigning a dedicated key to every verb |
| Player animation | Medium | Virtual-rig locomotion and three work actions | Add carrying, loading, repairs, processing, machinery and animal handling; later use authored rigs |
| Legacy event scheduler | Medium | Warned deterministic crop/animal event | Generalize event instances, responses, severity, site scope, saved state and late-game overlap |
| SessionController | Low for the full career | First-run panels, onboarding and terminal outcome | Split session, season and career orchestration; land purchase must stop ending the career |
| Save schema | Low for full progression | One-site economic state | Introduce a versioned career save with migrations and multiple sites |
| SaveDirector | Medium | Local, account and optional cloud tiers | Hydrate the scene, move large local saves to IndexedDB, checkpoint more state and improve conflicts |
| Server save validation | Medium | Tick, inventory, storage, land and crop plausibility | Validate progression transitions, sites, unlocks, finance, contracts and new production |
| Market service | Medium-high | Server-authoritative trade and generated orders | Add buyers, trust, accepted obligations, quality, standing contracts and regional markets |
| UI panels and HUD | Medium | Clear first-session market/build surfaces | Add navigation hierarchy, categories, map, workers, processing, season and town views |
| Asset pipeline | High | Reproducible low-poly assets, budgets and interface renders | Add staged asset packs, many new assets and revised full-game budgets |
| Audio pipeline | High | Stable IDs, optional files and procedural fallback | Add only new semantic cues and keep region/music additions lazy |
| Analytics | High in pattern | Typed event funnel outside gameplay | Add progression funnels, season cohorts, recovery and specialization metrics |

---

## 32. Foundation gaps identified by the audit

### 32.1 Saved state is written but is not yet used to construct the active farm

The current SaveDirector can:

- write locally;
- write to the account backend;
- write to Glitch Cloud Save;
- read the best available save;
- expose FarmWorld.fromSaveState as a reconstruction path.

However, normal farm-scene creation still constructs a new FarmWorld from STARTER_FARM. The best
save is checked after login, but that state is not passed into the next FarmScene and is not used to
hydrate the world.

Before persistent progression can work:

1. The best save must be selected before a campaign scene is constructed.
2. FarmScene must receive either a new-career request or a validated saved career.
3. The scene must build the correct site and world from that saved state.
4. New-player grants, including the starting chickens, must only occur on a genuinely new career.
5. Failed or incompatible saves must produce a recovery path rather than silently creating a new
   farm.

This is the first required progression foundation. New persistent systems should not be added until
the existing save actually resumes play.

### 32.2 The server's new-save document does not describe the starter farm

The server currently creates an initial save with:

- no plots;
- no buildings;
- no animals;
- no level identifier;
- one land parcel.

The client starter world creates its plots and initial world from game-only level data. These two
initial-state definitions are not the same source of truth.

Full progression needs one canonical new-career factory. The server, client and tests must agree on:

- starter site ID;
- starter region;
- available parcels;
- plot or field locations;
- starting shelter;
- starting inventory;
- starting animals;
- starting balance;
- initial season and calendar;
- initial unlocks;
- initial RNG streams.

World definitions needed for validation should live in the shared contract or be generated into a
shared data catalog. The server must not import the game client.

### 32.3 The current save has no migration path

The save schema and local-storage key are both version 1. An unrecognized version is ignored.

Progression will change the save repeatedly. A formal migration chain is required:

    version 1
       ↓
    migrate to version 2
       ↓
    migrate to version 3
       ↓
    validate current schema

Each migration must:

- preserve the old source document until the new save is verified;
- be deterministic;
- be tested with real historical fixtures;
- work for local, account and cloud saves;
- record why a default value was chosen;
- refuse unsafe migration with a player-readable recovery option.

Database migrations and save-document migrations are different systems. Both are required.

### 32.4 Land ownership currently does not change the playable world

Buying land currently:

- subtracts money;
- increments landParcels;
- emits an event;
- ends the run.

It does not:

- add tiles;
- add plots;
- move a fence or gate;
- expose buildable terrain;
- change collision;
- change the camera or world view.

The first post-slice progression milestone requires land purchase to become a physical world
transition.

### 32.5 Autosave is tied too closely to balance changes

Remote autosave currently checks its interval when balance changes. A player can:

- finish construction;
- survive an event;
- change worker assignments;
- move goods;
- change a processing queue;
- progress a season;
- alter a utility network;

without necessarily triggering a balance event.

The full game needs:

- a time-based autosave cadence independent of a specific world event;
- immediate checkpoints after major irreversible actions;
- a local write before remote write;
- a dirty-state tracker so unchanged worlds are not repeatedly serialized;
- save-on-background and save-on-scene-transition;
- recovery after interruption during a season summary or transaction.

---

## 33. Required save-system design

### 33.1 Replace SaveState with a career document

The current save represents one farm. The full game needs a CareerSaveState containing multiple
layers.

Recommended top-level shape:

| Area | State that must persist |
| --- | --- |
| Identity | Career ID, schema version, creation version, career seed |
| Time | Monotonic career tick, calendar, day, season, year |
| Progression | Career stage, licenses, blueprints, discovered systems |
| Economy | Cash, committed expenses, debt, loans, insurance |
| Reputation | Regional reputation and buyer trust |
| Town | Prosperity, population band, completed projects, active needs |
| Sites | One or more farm-site states |
| Contracts | Accepted obligations and standing schedules |
| Events | Active warnings, incidents, cooldowns and recovery effects |
| Statistics | Lifetime, season and site statistics |
| RNG | Separate deterministic stream states by system |
| Preferences | Only campaign-specific choices, not general settings |

### 33.2 Farm-site state

Each site needs:

- site ID;
- region definition ID;
- site seed;
- owned parcel IDs;
- active or inactive status;
- local tick or last simulated career tick;
- fields and plots;
- buildings;
- localized inventories;
- animals or herds;
- processor queues;
- utilities;
- vehicles;
- workers and assignments;
- local event state;
- site-specific reputation or contracts where needed.

Tile coordinates may remain local to each site. A site ID must be included in every persistent
entity reference.

### 33.3 Stable entity IDs

Current buildings are identified by kind and tile position. That is insufficient once buildings
can:

- rotate;
- upgrade;
- move;
- contain inventory;
- process goods;
- break down;
- employ a worker;
- participate in a utility network.

Every persistent entity needs a stable ID:

- building ID;
- field ID;
- animal group or herd ID;
- worker ID;
- vehicle ID;
- processor queue ID where necessary;
- contract ID;
- event instance ID.

Coordinates describe where an entity is. They should not be its identity.

### 33.4 Building state

Future placed-building state needs at least:

- ID;
- kind;
- site ID;
- tile origin;
- rotation;
- construction progress;
- upgrade tier;
- condition or durability if maintenance is active;
- enabled/disabled state;
- input inventory;
- output inventory;
- processing queue;
- utility connections;
- assigned worker or automation policy.

Not every building uses every field. Specialized state should be stored in typed substructures
rather than one object filled with nullable values.

### 33.5 Inventory state

The current inventory is global. Physical hauling requires inventory to exist at locations.

Recommended inventory nodes:

- player carried inventory;
- barn;
- cold store;
- silo;
- processor input;
- processor output;
- animal feeder;
- vehicle cargo;
- loading dock;
- delivery reservation;
- remote-site storage.

The HUD may still show a total-farm projection, but rules must operate on the actual node holding the
goods.

The version-1 migration should place existing inventory into a designated starter storage node.

### 33.6 Player state

The current save does not need player position because a run is short. Physical hauling makes it
important.

Persist:

- active site;
- player position and facing;
- carried goods;
- equipped tool;
- vehicle being operated;
- current safe interruption state.

Do not save a half-completed animation frame. Save the underlying action state and resume from a
safe logical checkpoint.

### 33.7 Event and scheduler state

The current event director's warning, active event and next-event countdown are not in SaveState.
Reloading therefore resets or rerolls the event schedule.

Persist:

- current event instance;
- phase;
- remaining warning or active ticks;
- targets;
- selected response state;
- severity;
- next-event tick;
- cooldowns;
- recent-event history;
- separate RNG stream state.

This prevents save/reload from becoming an event-avoidance exploit.

### 33.8 Fractional and accumulated values

The current world carries fractional upkeep remainder in memory but does not save it. Progression
adds more accumulated quantities:

- partial upkeep;
- wages;
- processing progress;
- machine maintenance;
- soil changes;
- freshness decay;
- utility consumption;
- worker task progress.

Either:

- persist each accumulator; or
- redesign the rule to use integer fixed-point accounting that can be derived from saved timestamps.

Reloading must not erase a cost or duplicate production.

### 33.9 Local storage technology

The full career document may exceed safe synchronous localStorage size and performance.

Recommended storage progression:

1. Continue reading version-1 localStorage saves.
2. Migrate full careers to IndexedDB.
3. Keep a small localStorage pointer containing the current career ID and last-known metadata.
4. Write career data asynchronously and atomically.
5. Retain one previous local checkpoint for recovery.

Glitch's 50 MB maximum is not a sensible target. A normal career should remain far smaller.

Provisional save budgets:

- starter career below 250 KB uncompressed JSON;
- mature single-region career below 1 MB;
- large multi-region career below 3 MB;
- automatic warning and measurement above those targets.

### 33.10 Save slots and scenarios

The current database allows one save per user.

If the product includes:

- a persistent campaign;
- challenge scenarios;
- optional legacy careers;
- manual backups;

then the database needs save slots or separate career rows.

Recommended minimum:

- one autosave campaign slot;
- one previous-checkpoint recovery slot;
- separate scenario records that cannot overwrite the campaign.

---

## 34. Land, parcels and tile expansion

### 34.1 Do not resize the centered TileGrid after purchase

TileGrid centers coordinates around its width and depth. Increasing the grid dimensions after a land
purchase would change the world-space position of every existing tile.

That would move:

- buildings;
- plots;
- the player;
- animals;
- collision;
- camera targets;
- saved coordinates.

Dynamic grid resizing is therefore the wrong first expansion strategy.

### 34.2 Recommended contiguous-farm strategy

For the main farm:

1. Allocate the final local estate grid when the site is created.
2. Partition it into named parcel rectangles or parcel masks.
3. Mark only the starter parcel as owned.
4. Render neighboring land visibly.
5. Block planting and construction on unowned parcels.
6. Open a gate, remove a boundary or change a parcel overlay when purchased.

Recommended active-site ceiling:

- 32×32 for the first progression prototype;
- up to 64×64 for a mature farm site;
- multiple sites rather than one grid beyond that.

A 64×64 grid contains 4,096 tiles, matching the current default A* exploration ceiling. Larger
regional worlds should use site-to-site travel and hierarchical routing, not one enormous TileGrid.

### 34.3 Parcel data

Each parcel definition needs:

- parcel ID;
- site ID;
- tile mask or rectangular bounds;
- purchase cost rule;
- unlock requirement;
- terrain and soil summary;
- entry points;
- initial blocked scenery;
- water access;
- allowed use;
- neighboring parcel links.

Ownership should be a set of parcel IDs, not only an integer count.

### 34.4 Layered grid data

The current Uint8 tile flag contains:

- blocked;
- occupied;
- road;
- soil;
- enclosed.

Progression adds likely needs for:

- ownership;
- water;
- pasture;
- field designation;
- utility corridors;
- processing access;
- vehicle access;
- region hazards;
- loading areas;
- seasonal terrain state.

Three spare bits are not enough for the long-term design.

Recommended grid architecture:

- terrain layer;
- occupancy layer;
- ownership or parcel layer;
- road and traversal-cost layer;
- field and soil layer;
- utility-network layer;
- hazard or temporary-effect layer;
- fine collision layer.

These may be separate typed arrays. This is clearer than forcing unrelated meanings into one flag
byte.

### 34.5 Dynamic plots and fields

PlotView currently copies the fixed plot ID list from LevelDefinition at construction. A purchased
parcel cannot add new plots to that view.

There are two delivery options.

#### Short-term option: predefined locked plots

Each parcel contains predetermined beds. Purchase reveals and activates them.

Benefits:

- lowest implementation risk;
- preserves one-tile plots;
- works with the current art;
- simple save migration.

Cost:

- weaker city-building and field-layout freedom.

This is appropriate for Progression Slice A.

#### Long-term option: player-designated fields

The player converts suitable terrain into fields or field groups.

Benefits:

- stronger planning;
- machinery and crop rotation become spatial;
- land shape matters;
- better long-term farm identity.

Required changes:

- dynamic plot or field registry;
- instanced meshes that can grow capacity or rebuild by chunk;
- field IDs and tile sets in the save;
- soil state per tile or field;
- machinery work areas;
- field-level UI.

Recommended transition:

1. Predefined beds for the first two stages.
2. Unlock field designation with the first machinery or specialist license.
3. Keep small beds for premium crops while bulk crops use field groups.

### 34.6 Pathfinding at larger scale

The current A* implementation is appropriate for local paths up to roughly a 64×64 site.

Progression needs distinct path classes:

- player foot path;
- worker foot path;
- animal movement area;
- cart path;
- vehicle road path;
- site-to-site transport route.

Vehicle paths should not use every walkable tile. They should use roads, gates, turning space and
loading points.

For regional trade:

- local pathfinding moves goods to a depot;
- a regional route graph moves shipments between sites and towns;
- local pathfinding moves them from destination depot to storage.

Do not run tile A* across an entire regional map.

---

## 35. Simulation scaling

### 35.1 Current cost model

FarmWorld currently advances every planted plot every simulation tick. At 60 Hz this is acceptable
for six plots and still manageable for dozens.

It is unnecessary for:

- hundreds of crop tiles;
- several processors;
- many workers;
- multiple inactive sites;
- seasonal soil and freshness changes.

### 35.2 Separate movement frequency from economy frequency

Recommended model:

- player movement and collision remain at 60 Hz;
- immediate interactions remain on fixed ticks;
- actor steering may run at 10–30 Hz depending on actor;
- crop, soil, animal and processing rules advance in deterministic batches;
- market, town and regional systems advance on slower scheduled ticks.

The main loop remains fixed and deterministic. Systems accumulate ticks and process at their own
fixed cadence.

Example cadences:

| System | Suggested cadence |
| --- | --- |
| Player movement and interaction | 60 Hz |
| Visible animal movement | 20–30 Hz simulation, interpolated rendering |
| Worker task steering | 10–20 Hz |
| Crop water and growth | 1–4 Hz |
| Processing queues | 1 Hz |
| Freshness and soil | Once per in-game minute or event boundary |
| Town growth | Once per in-game day |
| Market rotation | Scheduled windows |
| Remote-site simulation | Coarse catch-up when career time advances |

These values require profiling and are not balance rules.

### 35.3 Active and inactive sites

Only the active site should run full movement, collision and presentation.

Inactive sites should use coarse deterministic simulation:

- scheduled production completion;
- stored worker policies;
- utility availability;
- reserved inputs;
- event outcomes;
- transport schedules.

The save records the career tick at which the site was last evaluated. When it becomes relevant,
shared rules advance it to the current career tick.

This avoids simulating several farms at 60 Hz while preserving deterministic outcomes.

### 35.4 Offline progress decision

The current game does not intentionally advance the economy while closed.

The full design must choose explicitly:

- no offline progress;
- capped offline progress;
- full offline progression.

Recommendation:

- no offline crop windfall during the first progression releases;
- later allow capped processor and worker catch-up only when inputs were already committed;
- use the server timestamp or trusted cloud timestamp at the load boundary;
- cap catch-up so a long absence cannot overflow storage or destroy a farm unseen;
- summarize every offline result before play resumes.

Date.now must never enter shared simulation rules. Wall-clock time is converted into an approved
tick delta at the save/load boundary.

---

## 36. FarmWorld refactor

FarmWorld is already responsible for:

- plot state;
- construction;
- animals;
- inventory;
- balance;
- upkeep;
- irrigation;
- grid state;
- serialization;
- run statistics.

Adding the full progression directly would create a monolith.

Recommended model ownership:

| Model or system | Responsibility |
| --- | --- |
| FarmWorld | Site facade, tick order, projections and system composition |
| FieldModel | Fields, plots, crop state, soil and irrigation exposure |
| BuildingModel | Placement, construction, upgrades and building state |
| InventoryModel | Local inventories, transfers, capacity and reservations |
| AnimalModel | Herds, feed, shelter, welfare and production |
| ProcessingModel | Recipes, queues, inputs, outputs and breakdowns |
| LogisticsModel | Hauling tasks, routes, depots and shipments |
| WorkforceModel | Workers, schedules, skills, wages and task priorities |
| UtilityModel | Water, fuel, power-like capacity and network flow |
| SiteEventModel | Site warnings, incidents, damage and recovery |
| SeasonModel | Calendar, suitability, forecasts and seasonal objectives |

The game layer owns orchestration. Economic decisions and deterministic transitions remain in
shared rule modules.

FarmWorld should continue to expose simple read-only projections so UI and scenes do not need to
understand every internal subsystem.

---

## 37. New shared rule domains

The following should be separate rule files or cohesive rule folders, not one progression file.

### Progression rules

- milestone eligibility;
- unlock prerequisites;
- license requirements;
- stage promotion;
- visible locked-state reasons.

### Reputation rules

- buyer trust gain and loss;
- regional reputation;
- order eligibility;
- community contribution;
- recovery after missed contracts.

### Logistics rules

- item transfer;
- carry capacity;
- cargo weight;
- loading and unloading;
- task reservation;
- route cost;
- delivery completion.

### Processing rules

- recipes;
- input reservation;
- queue duration;
- quality conversion;
- output capacity;
- cancellation and partial progress;
- maintenance impact.

### Soil and field rules

- crop rotation;
- nutrient or soil-health changes;
- compost;
- fallow recovery;
- disease pressure;
- region and season suitability.

### Quality and freshness rules

- quality score;
- freshness decay;
- cold-storage effect;
- contract qualification;
- spoilage result.

Use bounded integers or fixed-point values for economic quality and multipliers where rounding
affects money.

### Workforce rules

- wages;
- task priority;
- skill;
- work duration;
- travel cost;
- shift availability;
- task failure and reassignment.

### Utility rules

- network connectivity;
- source capacity;
- storage;
- demand;
- priority allocation;
- outage behavior.

### Finance rules

- loans;
- interest;
- payment schedule;
- delinquency;
- insurance premiums;
- claims;
- recovery restructuring.

### Town rules

- prosperity inputs;
- population band;
- project prerequisites;
- service unlocks;
- labor pool;
- town demand.

### Region and season rules

- crop suitability;
- animal suitability;
- seasonal windows;
- event weights;
- market modifiers;
- travel and transport costs.

### Career outcome rules

The current expanded or bankrupt run outcome should become:

- season status;
- milestone status;
- recovery status;
- challenge-scenario outcome;
- authored career completion.

A normal land purchase should no longer cause a terminal outcome.

---

## 38. Command and interaction expansion

### 38.1 Do not add one key per new system

The current action map is readable because it has one contextual work button plus a few panel
shortcuts.

The full game may need:

- pick up;
- put down;
- transfer;
- feed;
- repair;
- operate;
- inspect;
- assign;
- enter vehicle;
- attach cart;
- load delivery.

These should mostly remain contextual forms of Work or Interact.

The interaction prompt should resolve:

- target;
- primary action;
- optional secondary action;
- required tool;
- carried item;
- blocked reason.

### 38.2 Context interaction model

Recommended interaction result:

| Situation | Primary action |
| --- | --- |
| Empty field | Plant |
| Growing field | Tend |
| Ready field | Harvest |
| Harvested goods on player | Deposit |
| Storage while empty-handed | Withdraw or inspect |
| Processor with carried inputs | Load |
| Processor with output | Collect |
| Hungry animal feeder | Fill |
| Damaged building | Repair |
| Vehicle | Enter or attach |
| Worker | Inspect assignment |
| Event target | Perform mitigation |

Complex choices can open a small contextual panel or radial menu. Repeated common work should remain
one action.

### 38.3 Command organization

FarmCommands should be split by domain before progression growth:

- field commands;
- inventory-transfer commands;
- building commands;
- animal commands;
- processing commands;
- workforce commands;
- logistics commands;
- finance commands;
- progression and land commands.

Each command still returns a shared Result and emits domain events after success.

### 38.4 Physical hauling system

Hauling requires:

1. Harvest creates goods at a field or in player carry, not global storage.
2. The player has weight or slot capacity.
3. Storage and processors are interaction targets.
4. Transfer rules reserve and move exact quantities.
5. Roads affect travel, carts and workers.
6. Contracts reserve goods at a loading point.
7. The total inventory view sums all nodes without pretending they are instantly accessible.

Avoid dropping hundreds of individual item meshes. Use:

- one crate, sack or basket visual;
- a fill-level or stack count;
- a small label when inspected;
- pooled pickup and deposit effects.

---

## 39. Progression and season orchestration

### 39.1 Split the current SessionController

Recommended controllers:

#### SessionController

Owns:

- current panels;
- placement mode;
- immediate player-facing commands;
- local onboarding;
- scene input isolation.

#### SeasonController

Owns:

- season start;
- forecast and demand reveal;
- seasonal objectives;
- season calendar;
- season summary;
- transition to the next season.

#### CareerController

Owns:

- career stage;
- milestone promotion;
- unlocks and licenses;
- active site;
- town and regional progression;
- career completion;
- recovery or restructuring.

#### SaveCoordinator

Owns:

- loading before scene construction;
- dirty state;
- checkpoint policy;
- schema migration;
- local/account/cloud synchronization.

This prevents one session class from becoming responsible for the entire campaign.

### 39.2 Season transition behavior

A season boundary should:

1. Finish or carry over explicitly permitted production.
2. Resolve expired contracts.
3. Charge scheduled finance obligations.
4. Generate a season report.
5. Apply reputation and town outcomes.
6. Evaluate milestones.
7. Reveal newly available systems.
8. Generate the next forecast and demand set.
9. Save a checkpoint.
10. Return the player to the same persistent farm.

It should not automatically remove:

- buildings;
- land;
- tools;
- workers;
- buyer relationships;
- major stored goods unless the design explicitly models seasonal spoilage.

---

## 40. Event-system expansion

### 40.1 Current event limitations

The current event model assumes:

- one current event;
- crop or animal targets;
- one multiplier;
- paid prevention;
- automatic mitigation from irrigation or fences;
- no persisted scheduler state.

This is sufficient for the first playable and not for the progression plan.

### 40.2 Event definitions versus event instances

An event definition describes the type:

- drought;
- disease;
- breakdown;
- road closure;
- recession.

An event instance records:

- unique ID;
- site or regional scope;
- severity;
- start and impact ticks;
- exact target entity IDs;
- selected response;
- mitigation progress;
- outcome;
- recovery effects;
- source RNG stream.

Definitions are static data. Instances are saved state.

### 40.3 Event eligibility

Events should only enter the selection pool when they are meaningful.

Examples:

- no cold-store failure without a cold store;
- no worker shortage before workers;
- no rail outage without rail;
- no livestock disease without animals;
- no flood in a region without flood exposure;
- no export crash before export contracts.

Event weighting should consider:

- career stage;
- region;
- season;
- current exposure;
- recent event history;
- active contracts;
- player-selected difficulty;
- installed resilience.

### 40.4 Active response tasks

Responses need commands and world targets.

Examples:

- water selected high-value fields;
- move animals to a protected shelter;
- repair a pump;
- quarantine a field;
- unload a failing cold store;
- redirect a delivery;
- assign workers to emergency tasks;
- shut down a processor;
- release reservoir water;
- cancel or renegotiate a contract.

Mitigation becomes progress toward an event objective, not only a Boolean flag.

### 40.5 Multiple incidents

Early game should retain one event at a time.

Late game may permit:

- one regional event plus local consequences;
- one warning while another incident is recovering;
- related event chains.

Do not allow several unrelated urgent warnings to stack. The event queue should enforce pacing and
the UI should show one primary urgency with secondary monitored issues.

### 40.6 Visual and audio requirements per event

Every event needs:

- warning icon;
- target highlight;
- world-state change;
- response effect;
- impact effect;
- recovery effect;
- warning audio;
- impact audio when semantically distinct;
- resolution feedback.

Examples:

- disease: leaf tint, patch marker, treatment mist, cleared-state recovery;
- pump failure: stopped water, sputter animation, repair sparks or tool beat;
- cold-store failure: warning lamp, condensation change, unloading urgency;
- flood: water boundary and wet-ground treatment;
- road closure: physical barrier and reroute marker.

---

## 41. Backend and authority changes

### 41.1 Decide the authority grade for progression

Current trades are fully server-authoritative. Most other state is plausibility-checked.

The full game introduces valuable persistent changes:

- land;
- licenses;
- reputation;
- loans;
- insurance;
- community projects;
- machinery;
- standing contracts;
- career milestones.

For a noncompetitive single-player game, plausibility validation can remain acceptable, but the
server must at least validate legal transitions.

Recommended authority split:

#### Fully authoritative

- external sale payouts;
- contract payouts;
- loans issued;
- repayments;
- insurance claims;
- account-level achievements;
- leaderboard submissions if ever enabled.

#### Shared-rule transition validated

- purchases;
- construction;
- land ownership;
- license unlocks;
- reputation changes;
- worker hiring;
- processing results;
- seasonal progression;
- town projects.

#### Client presentation only

- camera;
- cosmetic animation;
- non-economic particle timing;
- transient UI state.

If player trading, real-money purchases or meaningful competitive leaderboards are introduced, the
career simulation must move to stronger server-side command processing or re-simulation.

### 41.2 Save validation must become transition-aware

Current validation mostly checks rate ceilings.

Progression validation should also check:

- site IDs are known;
- parcel purchases meet prerequisites;
- new buildings are legal and paid for;
- building upgrades follow their sequence;
- field tiles belong to owned parcels;
- animals fit shelter and region rules;
- processor output matches consumed inputs and elapsed time;
- quality and freshness are within possible bounds;
- reputation changes match completed or failed obligations;
- loans and payments match server records;
- season cannot skip forward illegally;
- active event state follows a valid event definition;
- unlocks are earned rather than inserted.

Do not build one enormous validation function. Validate each state domain through its shared rules.

### 41.3 Market data model

The current order table already stores buyer ID, which is a useful foundation.

Expansion needs:

- buyer definitions and unlock requirements;
- buyer relationship state;
- accepted versus merely offered orders;
- standing contract schedules;
- quality and freshness requirements;
- delivery-site requirement;
- cancellation and failure state;
- regional market;
- seasonal demand window.

Server-owned obligations should live in transactional tables rather than only inside the save JSON.

Likely server-owned records:

- buyer relationships;
- accepted contracts;
- recurring contract schedule;
- loans;
- insurance policies and claims;
- authoritative progression awards if achievements depend on them.

### 41.4 API surface

The current API only supports save and market trades.

Potential intent routes:

- accept contract;
- cancel or renegotiate contract;
- complete delivery;
- take loan;
- repay loan;
- purchase land;
- purchase license;
- start community project;
- claim insurance;
- resolve save conflict.

Every money-moving route requires idempotency. The client sends an intent, never an amount.

### 41.5 Offline behavior

Offline play remains a product requirement.

For each authoritative action, define:

- can it be predicted offline;
- can it be queued;
- what happens if the server rejects it later;
- whether the player may continue spending predicted funds;
- how the UI labels pending state.

Long-running offline queues need durable storage. The current in-memory mutation queue disappears
when the tab closes.

For full progression, queued economic intents should be persisted with:

- idempotency key;
- route or command type;
- payload;
- predicted local result;
- attempts;
- creation time;
- dependency order.

---

## 42. Rendering and graphics changes

### 42.1 Plot rendering

Current strengths:

- instanced beds;
- instanced crop-stage meshes;
- fixed draw calls per crop and stage;
- wind and stress tint.

Required changes:

- discover crop IDs from the domain catalog instead of hardcoding wheat, corn and pumpkin;
- create buckets only for loaded crops;
- support parcel activation and dynamic field counts;
- rebuild or chunk instance capacity when fields change;
- support field-level soil and seasonal appearance;
- support quality, disease and treatment indicators without adding a material per plot.

Each new crop currently implies four world meshes and up to four additional draw calls when all
stages are visible. This remains workable for a moderate crop catalog but must be measured.

Recommended:

- load crop families by region or progression stage;
- keep only relevant crop geometries resident;
- use instance colors and shared shaders for stress/season variants;
- avoid loading every regional crop at campaign start.

### 42.2 Structure rendering

Current StructureView creates a separate object for every placed structure and rebuilds the dynamic
structure graph whenever the building signature changes.

Progression will produce many:

- roads;
- fences;
- irrigation segments;
- field markers;
- utility poles or channels;
- repeated storage units.

Required rendering split:

- instanced repeated structures by kind, rotation and state;
- separate unique meshes for major buildings;
- separate processor-state visuals;
- construction and damage overlays independent of base mesh;
- utility-flow visual layer;
- placement and upgrade preview layer.

Roads and fences should be the first categories moved to instancing.

Current implementation note: construction timing now lives in a dedicated
`ConstructionProgressView`, separate from `StructureView`, and renders a camera-facing progress bar
with remaining time over every in-progress building.

### 42.3 Animal rendering

The current simulation stores species-specific animal groups with stable shelter assignment. The
view renders representative subsets of up to 64 chickens, 24 sheep and 16 cows, distributed around
their nearest completed shelters. Rendering and collision use the same deterministic per-species
pose path, and large groups are proportionally capped rather than reinterpreted as chickens.

Further species still require:

- per-species visual groups;
- per-shelter or pasture location;
- species-specific motion;
- species-specific collision or movement area;
- visible subset rules for large herds;
- product and welfare feedback.

Do not create one simulation entity per animal in a herd unless gameplay requires it. A herd can be
an aggregate with a representative visible flock.

### 42.4 Worker and vehicle rendering

Workers need:

- reusable base character geometry or a small set of silhouettes;
- palette-controlled clothing variants;
- carried-tool and cargo attachments;
- task and route indicators;
- selection or assignment feedback.

Vehicles need:

- body;
- wheels or tracks;
- attachment points;
- cargo state;
- steering and suspension presentation;
- dust and engine effects;
- headlights only if time-of-day requires them.

Machinery is the point where transform animation may no longer be enough. Multi-part authored
assets or skeletal rigs will likely be required.

### 42.5 Large-map presentation

The current camera is designed for local walk-around play.

Larger sites need:

- optional farm overview camera;
- parcel boundary overlay;
- field labels;
- worker and vehicle markers;
- route visualization;
- utility overlays;
- event target navigation;
- map or site-selection screen;
- fast travel between distant site hubs.

The local follow camera should remain the default for physical work.

### 42.6 Biomes and seasons

Current world colors are baked into vertex colors.

Season and biome delivery options:

#### Build-time variants

- generate a GLB variant per biome or season;
- simplest art consistency;
- greater download and memory.

#### Shader and instance tint

- reuse geometry;
- multiply or remap palette bands;
- lower payload;
- limited control because baked colors cannot be individually reassigned without metadata.

#### Palette-index attribute

- author a palette role index alongside color;
- shader selects a biome palette;
- most flexible;
- changes the existing one-material contract and requires an ADR.

Recommended sequence:

1. Use build-time region packs for the first second biome.
2. Measure payload and memory.
3. Consider a palette-role shader only when multiple seasonal variants make duplication expensive.

Snow, mud or wet-ground visuals must respect the no-world-texture direction unless a deliberate ADR
changes it. Geometry, vertex tint, particles and water layers should be attempted first.

---

## 43. Asset requirements

### 43.1 Are more assets required?

Yes.

The current 103 world assets cover Millbrook progression plus sixteen complete crop species and only
fragments of the later regional/machinery stages.
The progression plan requires additional assets whenever the player gains a visible capability.

Not every rule needs a world asset:

- reputation;
- loans;
- buyer trust;
- contract slots;
- milestone logic.

These can be delivered with UI and world feedback using existing sets.

The following systems definitely require new world assets:

- physical hauling;
- new crops;
- new animals;
- new shelters;
- processing;
- workers;
- machinery;
- town growth;
- utilities;
- new regions;
- transport infrastructure;
- event-specific damage and response.

### 43.2 Asset requirements by progression slice

#### Slice A — Beyond the first parcel

Minimum new world assets:

- handcart;
- carried basket, sack or crate;
- loading pad or delivery post;
- parcel gate or boundary marker;
- delivery wagon or buyer pickup prop;
- second-buyer sign or market prop.

Likely UI illustrations:

- carry capacity;
- handcart;
- loading;
- second buyer;
- buyer trust;
- parcel unlocked;
- delivery contract;
- route or depot.

Animation and VFX:

- pickup;
- carry;
- deposit;
- cart push or pull;
- load delivery;
- wagon arrival and departure;
- parcel-opening celebration.

#### Slice B — Farm identity

For one specialization prototype:

- four stage meshes for one new crop, if crop-focused;
- one animal mesh and its product prop, if livestock-focused;
- one specialist shelter;
- one processor building;
- input and output container props;
- one storage specialization such as silo or cold store;
- compost or soil-treatment prop if soil is active;
- specialist buyer sign or delivery prop.

Animation and VFX:

- processor active/idle/broken state;
- load and collect actions;
- spoilage or quality feedback;
- animal gait and production;
- soil-treatment action;
- repair action.

#### Slice C — Local supplier

World assets:

- worker character variants;
- worker housing or town houses;
- market hall;
- workshop;
- community water structure;
- delivery wagon or truck;
- town road and street props;
- construction-stage civic props;
- task marker props where world-space feedback is needed.

Animation and VFX:

- worker locomotion;
- worker versions of farm actions;
- loading team;
- town construction;
- service activation;
- scheduled delivery.

#### Slice D — Regional enterprise

World assets:

- regional ground and dressing set;
- biome-specific vegetation and rocks;
- tractor;
- seeder or harvester attachment;
- water tanker or feed wagon;
- machinery shed;
- reservoir, pump and channels;
- depot;
- bridge;
- region-specific farm buildings;
- route markers and signage.

Animation and VFX:

- wheel rotation and steering;
- harvesting mechanism;
- seeding or spraying;
- engine exhaust and dust;
- flowing utility network;
- seasonal weather;
- bridge or depot activation.

#### Slice E — Agricultural estate

World assets:

- rail or export terminal kit;
- advanced processors;
- research facility;
- branded warehouse;
- acquired-farm signage;
- estate office;
- large regional infrastructure;
- endgame landmark projects.

### 43.3 Planning estimate

The exact set depends on selected specializations, but a reasonable content estimate is:

| Scope | Additional world meshes |
| --- | ---: |
| First post-parcel slice | 6–12 |
| One complete specialization | 10–20 |
| Local town and workers | 15–25 |
| First new region and machinery | 20–35 |
| Full authored career beyond the slice | Approximately 60–100 additional meshes |

A crop with four stages counts as four meshes. Modular town and region kits should be reused through
instancing instead of creating one unique building per lot.

These are production-planning ranges, not mandatory counts.

### 43.4 UI-art budget

The current 48-icon transparent interface-art set is 165,104 bytes under the 175 KB total budget
recorded in ADR 0024. Every crop has a distinct lazy inventory/market icon, as do sheep and wool.

The full progression cannot keep every crop, worker, building, machine, buyer and project inside
that original whole-game limit.

Required policy change:

- preserve a small critical starter interface set;
- lazy-load progression-category icons;
- group icons by panel or region;
- set per-screen and per-stage budgets;
- record total optional bytes separately;
- write a new ADR before replacing the original 100 KB assumption.

Do not silently raise the budget.

### 43.5 Model payload and compression

The current complete model catalog is about 966 KB gzip. Crop packs are now split into common,
spring, summer, autumn and winter GLBs; the critical Spring model path is about 581 KB gzip because
common world families and the active crop pack are both loaded, with the 86 KB props pack preloaded
separately. ADR 0024 records the split and the need for loaded-season device profiling before
compression changes.

More content requires:

- progression-stage asset packs;
- region-specific lazy loading;
- unloading assets no longer needed;
- remeasurement of Meshopt net savings;
- possible adoption of Meshopt once the measured first-load saving exceeds the recorded trigger;
- continued avoidance of Draco unless its decoder cost becomes worthwhile.

The starter farm must not download the entire agricultural-estate catalog.

Provisional delivery policy:

- starter critical models remain under roughly 350 KB gzip;
- each optional progression or region pack gets its own measured budget;
- only the active region and nearby progression content remain resident;
- shared characters, tools and common props stay in reusable families.

---

## 44. Animation requirements

### 44.1 What the current system can support

The current virtual rig is suitable for:

- additional short hand-tool actions;
- carrying a small object;
- pickup and deposit;
- simple repair;
- one-worker reuse at gameplay distance;
- simple cart movement;
- processor pulses and rotating parts;
- basic event response.

These can initially use:

- body transforms;
- tool attachments;
- one-shot timing;
- particles;
- shader motion;
- instanced actor transforms.

### 44.2 Where authored animation becomes necessary

Authored skeletal or articulated animation becomes increasingly valuable for:

- several workers on screen;
- believable lifting and carrying;
- pushing a loaded cart;
- milking or animal care;
- entering and operating vehicles;
- tractor steering and seated poses;
- larger animal gait;
- machinery contact with crops;
- close-up town interactions.

The full progression should not keep extending one generic whole-mesh bob for every action.

Recommended animation transition:

1. Slice A uses the existing virtual rig plus carry/cart attachments.
2. Slice B adds authored or better articulated animal motion for the chosen new species.
3. Slice C introduces a reusable humanoid skeleton for farmer and workers.
4. Slice D introduces articulated machinery and vehicle-specific driver animation.

### 44.3 New player work actions

Likely semantic actions:

- pick up;
- carry;
- deposit;
- load;
- unload;
- feed;
- repair;
- treat;
- operate;
- inspect;
- attach;
- build or contribute;
- handle animal.

Current implementation note: pickup/deposit use a tool-free transfer gesture, repair uses a
tool-free maintenance gesture, and `move_animals` uses the shoo/wave gesture. These remain semantic
animation states rather than new dedicated keyboard verbs; the context action is still `E`/Work.

WorkAction should not become presentation's only source of truth for long-running actions.

Separate:

- command state;
- task state;
- animation state;
- equipped tool;
- carried item.

A worker and the player may perform the same task with different presentation.

### 44.4 Processing animation

Every processor should clearly show:

- idle;
- waiting for input;
- active;
- output blocked;
- broken;
- upgrading.

Use moving parts, material tint, steam, water, sound and output props before adding explanatory UI.

### 44.5 Event animation and VFX

Event-specific presentation is required for:

- disease treatment;
- quarantine;
- pump repair;
- storage failure;
- flood response;
- machinery breakdown;
- road closure;
- emergency loading;
- reservoir release.

The existing pooled VFX pattern should be expanded into effect families rather than creating a new
particle system per event.

---

## 45. Audio requirements

The current audio architecture can be reused.

Add a new sound only when it communicates a distinct meaning.

Likely new semantic groups:

- item pickup and deposit;
- cart movement;
- loading and shipment departure;
- processor start, loop and completion;
- breakdown and repair;
- new animal alerts and production;
- worker assignment confirmation;
- machinery engine and work loop;
- utility warning;
- town milestone;
- season transition;
- regional event warning and recovery.

Continuous machinery audio needs:

- distance attenuation;
- lifecycle control;
- no duplicate loop per identical nearby machine;
- pause and scene cleanup;
- lower-memory behavior on mobile.

New region music should remain lazy. Do not increase the default preload path for content a new
player cannot access.

---

## 46. UI and information architecture

### 46.1 The current panels will not scale as one long list

The current Build panel can show:

- four buildings;
- one animal;
- one land purchase.

The full progression may contain dozens of options.

Recommended Build and Reinvest hierarchy:

- Fields and crops.
- Storage and logistics.
- Animals.
- Processing.
- Utilities.
- Workers and housing.
- Community.
- Land and regions.

The player should see:

- available options;
- locked options;
- unlock reason;
- current effect;
- operating cost;
- footprint;
- prerequisites;
- conflict or capacity warning.

Search is not required early, but filtering and categories will be.

### 46.2 Market hierarchy

The market panel currently has one buyer title.

Full market UI needs:

- buyer list;
- trust;
- offered orders;
- accepted contracts;
- standing contracts;
- spot market;
- quality requirements;
- delivery location;
- expiry and penalty;
- regional market tabs;
- reserved inventory.

The main first-session sell path must remain obvious.

### 46.3 New management surfaces

Likely panels or screens:

- Season plan.
- Farm overview.
- Field details.
- Processing queue.
- Worker assignment.
- Vehicle and machinery.
- Utilities.
- Buyer relationships.
- Town projects.
- Finance.
- Region map.
- Career milestones.
- Season report.
- Recovery or restructuring.

Panels should not pause the active farm when they are quick operational tools. Full-screen planning
or region transitions may pause.

### 46.4 HUD progression

Do not display every mature-career metric at once.

Context layers:

- local work HUD;
- selected object details;
- active warning;
- current contract;
- carried cargo;
- worker or vehicle task;
- optional management overlay.

Metrics appear when their system unlocks.

### 46.5 Touch controls

Touch currently supports movement, seed, protect and work.

More gameplay verbs require:

- contextual Work remaining primary;
- one contextual secondary-action button;
- radial or short action menu for ambiguous targets;
- vehicle controls when driving;
- management interactions through panels rather than more permanent buttons.

Avoid a screen full of progression-specific touch buttons.

### 46.6 UI technology threshold

The plain DOM approach remains appropriate for focused panels.

Revisit the UI framework ADR if the game requires:

- large sortable inventories;
- complex drag-and-drop schedules;
- deeply nested production graphs;
- extensive filtering;
- reactive multi-panel state;
- virtualized long lists.

Do not switch frameworks merely because the option count grows. Switch when state coordination and
component reuse measurably exceed the current approach.

---

## 47. Asset loading and memory architecture

### 47.1 Current limitation

FarmScene currently loops over a fixed list of six model families and attempts to load all of them.

This is suitable for one farm and not for:

- several regions;
- many crops;
- machinery;
- town kits;
- late-game processors.

### 47.2 Required asset-pack model

Recommended packs:

- starter common;
- common characters and tools;
- common buildings;
- specialization pack;
- region environment pack;
- region crops and animals;
- town pack;
- machinery pack;
- late-game infrastructure pack.

The scene requests packs based on:

- active region;
- career stage;
- placed content;
- upcoming transition.

### 47.3 Loading policy

- Starter-critical content blocks first farm entry.
- Nearby unlocked content preloads.
- Locked late-game content stays lazy.
- Region transition preloads before travel.
- Unused region packs may be released on memory-constrained devices.
- Missing optional packs fall back or disable the affected optional visual, not the entire game.

### 47.4 Provisional performance budgets

These must be confirmed on physical target devices.

| Metric | Starter target | Mature active-site target |
| --- | ---: | ---: |
| Draw calls | Current 91 in the physical iPhone starter view, 100 in exercised work/placement states | Prefer below 100; investigate above 150 |
| Visible triangles | Current approximately 223k in the physical iPhone starter view, approximately 225k exercised | Prefer below 250k on mobile target |
| Active local grid | 16×16 | Up to 64×64 |
| Fully simulated visible actors | Small flock and foxes | Approximately 50–100 with aggregation |
| Critical model payload | Current all-family path approximately 485 KB gzip | Starter path below approximately 350 KB gzip |
| Optional region pack | None | Measured and lazy, preferably below approximately 250 KB gzip each |

The exact numbers are secondary to device profiling. They are guardrails, not claims.

---

## 48. Stage-by-stage system-change matrix

### Slice A — Beyond the first parcel

#### Shared rules

- Parcel ownership.
- Carry capacity.
- Inventory transfer.
- Buyer trust.
- New milestone outcome.

#### Game simulation

- Larger preallocated site.
- Parcel activation.
- Local inventory nodes.
- Player carried inventory.
- Hauling interactions.
- Delivery loading point.

#### Save

- Career schema version 2.
- Site ID and parcel IDs.
- Carried and localized inventory.
- Save hydration into FarmScene.
- Event scheduler state.
- Migration from version 1.

#### Server

- Transition validation for parcel ownership.
- Buyer relationship state.
- Optional accept-contract intent.
- Durable offline mutation queue design.

#### UI

- Cargo HUD.
- Buyer selector.
- Trust display.
- Parcel boundary and unlock feedback.
- Revised season summary.

#### Assets and animation

- Cart, crates, loading pad, delivery prop and gate.
- Carry, pickup, deposit and cart motion.

#### Performance

- Dynamic or predefined second-parcel plots.
- First repeated-structure instancing review.

### Slice B — Farm identity

#### Shared rules

- License and progression.
- Processing.
- Quality or soil.
- New crop or animal.
- Specialist contracts.

#### Game simulation

- Processor queues.
- Input and output inventories.
- Specialist storage.
- New animal or field behavior.

#### Save

- Processor state.
- License state.
- Quality/soil state.
- Building stable IDs and rotation.

#### Server

- Validate recipes and elapsed production.
- Specialist buyer/order generation.
- Loan or insurance records if included.

#### UI

- License choice.
- Processor queue.
- Quality/soil explanation.
- Specialist buyer.

#### Assets and animation

- Processor, storage, crop stages or animal.
- Processor loop, load/collect, new animal motion.

### Slice C — Local supplier

#### Shared rules

- Worker tasks.
- Wages.
- Standing contracts.
- Town prosperity.
- Community projects.

#### Game simulation

- Workforce model.
- Task reservation.
- Worker pathing.
- Scheduled delivery.
- Town aggregate.

#### Save

- Worker IDs and assignments.
- Town state.
- Standing obligations.
- Project progress.

#### Server

- Standing contract records.
- Project and wage transition validation.
- Conflict-safe season completion.

#### UI

- Worker management.
- Town view.
- Project board.
- Schedule and delivery calendar.

#### Assets and animation

- Worker variants.
- Town modular kit.
- Wagon or truck.
- Worker action reuse and town construction.

### Slice D — Regional enterprise

#### Shared rules

- Regions.
- Seasons.
- Machinery.
- Utilities.
- Remote-site simulation.
- Regional trade.

#### Game simulation

- Site manager.
- Active/inactive site model.
- Vehicle movement.
- Utility networks.
- Region map.

#### Save

- Multiple sites.
- Active site.
- Vehicles.
- Utility graphs.
- Season and calendar.
- Regional event state.

#### Server

- Multi-site validation.
- Regional market.
- Site transition and catch-up validation.

#### UI

- Region map.
- Site switch.
- Machinery and utilities.
- Regional forecast.

#### Assets and animation

- Biome pack.
- Machinery.
- depot, bridge, reservoir and region props.
- Vehicle articulation and regional weather.

### Slice E — Agricultural estate

#### Shared rules

- Acquisitions.
- Export.
- Research.
- Estate strategy.
- Long-term regional resilience.

#### Game simulation

- Estate network.
- Policy effects.
- Advanced processors.
- Large infrastructure.

#### Save

- Research state.
- acquisition history;
- estate policies;
- regional network state;
- authored career completion.

#### Server

- authoritative awards;
- export obligations;
- optional leaderboard-grade validation if enabled.

#### UI

- estate overview;
- research;
- policy;
- endgame ambitions;
- network resilience.

#### Assets and animation

- export, research, rail and estate landmarks;
- large infrastructure activation;
- endgame presentation.

---

## 49. Testing expansion

### 49.1 Save tests

Required:

- version-1 to current migration fixture;
- round-trip of every progression subsystem;
- local IndexedDB recovery;
- account load into actual FarmScene;
- cloud conflict with meaningful comparison;
- reload during warning;
- reload during processing;
- reload while carrying goods;
- reload during construction;
- reload during season transition;
- multi-device stale revision.

### 49.2 Shared-rule tests

Each rule domain needs:

- boundary cases;
- failure cases;
- deterministic replay;
- long-duration accumulation;
- integer rounding;
- no duplication or resource loss;
- migration compatibility.

### 49.3 World integration tests

Required progression paths:

- buy parcel and physically enter it;
- harvest, carry and deposit;
- load and complete delivery;
- process raw goods;
- worker completes a reserved task;
- event interrupts and reprioritizes work;
- season closes and career continues;
- site switches and catches up deterministically.

### 49.4 Server tests

Required:

- illegal unlock rejected;
- unpaid building rejected;
- impossible processing output rejected;
- buyer trust cannot be forged;
- loan payout cannot replay;
- standing contract cannot pay twice;
- parcel cannot be claimed outside its sequence;
- site data cannot cross another user's career;
- save migration and protocol version behavior.

### 49.5 Rendering and performance tests

Required test scenes:

- maximum starter parcel;
- full 32×32 progression prototype;
- full 64×64 mature site;
- dense roads and fences;
- several crop species and stages;
- multiple animal species;
- workers and one machine;
- active event and utility overlay.

Measure:

- draw calls;
- visible triangles;
- frame time;
- memory;
- asset load time;
- save serialization time;
- pathfinding time;
- worker task update time.

### 49.6 End-to-end tests

Browser tests should cover milestone journeys rather than every balance permutation.

Examples:

- resume a local career;
- buy second parcel;
- perform first haul;
- unlock buyer;
- build and operate first processor;
- assign first worker;
- complete town project;
- transition region;
- recover from failed contract or event.

---

## 50. Required documentation and decision records

Progression implementation will require documentation updates before code changes are considered
complete.

Likely new topic documents:

- SAVE_AND_CAREER_STATE.md;
- WORLD_AND_PARCELS.md;
- LOGISTICS.md;
- PROCESSING_AND_QUALITY.md;
- WORKERS_AND_AUTOMATION.md;
- TOWN_AND_REGION.md;
- EVENTS_AND_RECOVERY.md.

Likely ADRs:

- persistent career versus self-contained standard runs;
- career save schema and migration strategy;
- IndexedDB local persistence;
- preallocated parcel grid versus dynamic or chunked world;
- active-site versus remote-site simulation;
- staged and region-based asset loading;
- future biome palette strategy;
- UI technology if the plain DOM approach is replaced;
- stronger server authority if competitive systems are added.

The existing first-playable document should remain a historical description of Stage 0. Current
implementation status should be moved to one maintained source of truth.

---

## 51. Recommended system-wide order of work

No later progression system should be built before its foundation exists.

### Foundation 1 — Reliable persistence

1. Define CareerSaveState.
2. Add save migration fixtures.
3. Hydrate FarmScene from the selected save.
4. Align server and client new-career creation.
5. Make autosave independent of balance events.
6. Persist event and accumulator state.
7. Add conflict recovery.

### Foundation 2 — Physical land expansion

1. Define a larger preallocated estate.
2. Add parcel IDs and ownership.
3. Make unowned land visible but unusable.
4. Open the land physically after purchase.
5. Stop treating land purchase as terminal career success.

### Foundation 3 — Logistics

1. Localize inventory.
2. Add carried inventory.
3. Add item-transfer rules.
4. Add loading points.
5. Connect roads and path cost to hauling.
6. Add cart presentation.

### Foundation 4 — Progression framework

1. Add career milestones.
2. Add unlock prerequisites.
3. Add buyer trust and regional reputation.
4. Add just-in-time progression teaching.
5. Add season summary without reset.

### Foundation 5 — Scale preparation

1. Refactor FarmWorld responsibilities.
2. Instance repeated structures.
3. Make crop rendering catalog-driven.
4. Introduce staged asset packs.
5. Add economic simulation cadence.
6. Profile 32×32 and 64×64 sites.

Only then proceed to processing, workers, town growth, regions and the estate endgame.

---

## 52. System-wide definition of done

A progression feature is not complete when its rule works in isolation.

It is complete when:

- its domain definition exists;
- its shared rules are deterministic;
- the player has a command or policy that affects it;
- it is represented in the save;
- old saves migrate safely;
- the server validates or authoritatively computes it;
- local/offline behavior is defined;
- account and cloud behavior is defined;
- the world shows its state;
- the UI explains the decision;
- animation communicates the action;
- audio communicates important meaning;
- analytics answer a named design question;
- tests cover success, failure, reload and conflict;
- performance is measured at intended scale;
- relevant documents and ADRs are updated.

The progression roadmap is therefore a sequence of vertical system slices, not a sequence of
content drops.

The first complete vertical progression slice is:

> resume the saved farm → buy and physically open the neighboring parcel → harvest goods into
> carried inventory → move them through a road and loading point → fulfill a second buyer's
> delivery → save and resume with the expanded farm intact.

If that entire chain works, the architecture is ready to support specialization, workers, towns and
regions. If any part of it is missing, adding more crops or buildings will increase content without
creating a durable progression game.
