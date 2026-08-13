import { describe, expect, it, vi } from 'vitest';
import { cents } from '@farmrise/shared';
import { BuildPanel } from '@ui/panels/BuildPanel.js';
import { CareerPanel } from '@ui/panels/CareerPanel.js';
import { MarketPanel } from '@ui/panels/MarketPanel.js';
import { SeedPanel } from '@ui/panels/SeedPanel.js';
import { TownPanel } from '@ui/panels/TownPanel.js';

describe('progression management panels', () => {
  it('shows seasonal seed art, price, harvest time, selection, and affordability', () => {
    const selectSeed = vi.fn();
    const panel = new SeedPanel({ onSelectSeed: selectSeed, onClose: vi.fn() });
    panel.update({
      seasonName: 'Spring',
      balance: cents(200),
      options: [
        {
          cropId: 'wheat',
          displayName: 'Wheat',
          cost: cents(135),
          growthTicks: 5_400,
          baseYield: 6,
          affordable: true,
          selected: true,
        },
        {
          cropId: 'strawberry',
          displayName: 'Strawberry',
          cost: cents(339),
          growthTicks: 21_600,
          baseYield: 8,
          affordable: false,
          selected: false,
        },
      ],
    });

    expect(panel.root.textContent).toMatch(/Spring seed cart.*\$2\.00/i);
    expect(panel.root.textContent).toMatch(/Wheat.*\$1\.35 seed.*1m 30s.*up to 6/i);
    expect(panel.root.textContent).toMatch(/Strawberry.*\$3\.39 seed.*6m.*up to 8/i);
    expect(
      panel.root
        .querySelector<HTMLButtonElement>('[data-testid="seed-option-wheat"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      panel.root.querySelector<HTMLButtonElement>('[data-testid="seed-option-strawberry"]')
        ?.disabled,
    ).toBe(true);

    panel.root.querySelector<HTMLButtonElement>('[data-testid="seed-option-wheat"]')!.click();
    expect(selectSeed).toHaveBeenCalledWith('wheat');
  });

  it('releases keyboard focus when building placement closes the build panel', () => {
    const panel = new BuildPanel({
      onSelectBuilding: vi.fn(),
      onBuyAnimal: vi.fn(),
      onBuyLand: vi.fn(),
      onBuyCarrier: vi.fn(),
      onClose: vi.fn(),
    });
    panel.update({
      balance: cents(1_000),
      options: [{ kind: 'road', cost: cents(400), affordable: true }],
      animals: [],
      shelterFree: 0,
      land: [],
      carriers: [],
    });
    document.body.append(panel.root);

    const roadButton = panel.root.querySelector<HTMLButtonElement>('[data-testid="build-road"]')!;
    panel.setVisible(true);
    roadButton.focus();
    expect(document.activeElement).toBe(roadButton);

    panel.setVisible(false);
    expect(document.activeElement).not.toBe(roadButton);

    panel.root.remove();
  });

  it('exposes unlocked livestock and carriers as real purchase actions', () => {
    const onBuyAnimal = vi.fn();
    const onBuyCarrier = vi.fn();
    const panel = new BuildPanel({
      onSelectBuilding: vi.fn(),
      onBuyAnimal,
      onBuyLand: vi.fn(),
      onBuyCarrier,
      onClose: vi.fn(),
    });
    panel.update({
      balance: cents(100_000),
      options: [],
      animals: [
        { species: 'chicken', affordable: true, shelterRequired: 1 },
        { species: 'sheep', affordable: true, shelterRequired: 2 },
        { species: 'cow', affordable: true, shelterRequired: 4 },
        { species: 'dog', affordable: true, shelterRequired: 1 },
      ],
      shelterFree: 8,
      land: [],
      carriers: [{ kind: 'wagon', affordable: true }],
    });

    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-animal-sheep"]')!.click();
    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-animal-cow"]')!.click();
    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-animal-dog"]')!.click();
    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-carrier-wagon"]')!.click();
    expect(onBuyAnimal).toHaveBeenCalledWith('sheep');
    expect(onBuyAnimal).toHaveBeenCalledWith('cow');
    expect(onBuyAnimal).toHaveBeenCalledWith('dog');
    expect(onBuyCarrier).toHaveBeenCalledWith('wagon');
    expect(panel.root.textContent).toMatch(/stored Corn.*Eggs.*sell the goods at Market/i);
    expect(panel.root.textContent).toMatch(/stored Clover.*Milk.*sell the goods at Market/i);
    expect(panel.root.textContent).toMatch(/stored Corn.*Wool.*sell the goods at Market/i);
    expect(panel.root.textContent).toMatch(/\$100\.00.*assigned shelter.*10 foxes per raid/i);
    expect(
      panel.root
        .querySelector<HTMLElement>('[data-testid="build-animal-row-sheep"] img')
        ?.getAttribute('src'),
    ).toMatch(/sheep\.webp$/);
    expect(
      panel.root
        .querySelector<HTMLElement>('[data-testid="build-animal-row-dog"] img')
        ?.getAttribute('src'),
    ).toMatch(/dog\.webp$/);
  });

  it('lists the $20 three-bed extension above the locked North Field', () => {
    const onBuyLand = vi.fn();
    const panel = new BuildPanel({
      onSelectBuilding: vi.fn(),
      onBuyAnimal: vi.fn(),
      onBuyLand,
      onBuyCarrier: vi.fn(),
      onClose: vi.fn(),
    });
    panel.update({
      balance: cents(4_880),
      options: [],
      animals: [],
      shelterFree: 2,
      land: [
        {
          parcelId: 'parcel-starter-extension',
          displayName: 'Starter Extension',
          cost: cents(2_000),
          bedCount: 3,
          description: 'Three nearby beds.',
          affordable: true,
          available: true,
          progress: 1,
          requirement: null,
        },
        {
          parcelId: 'parcel-north-field',
          displayName: 'North Field',
          cost: cents(7_500),
          bedCount: 8,
          description: 'The larger field.',
          affordable: false,
          available: false,
          progress: 0.65,
          requirement: 'Buy Starter Extension first',
        },
      ],
      carriers: [],
    });

    const extension = panel.root.querySelector<HTMLElement>(
      '[data-testid="build-land-row-parcel-starter-extension"]',
    )!;
    const north = panel.root.querySelector<HTMLElement>(
      '[data-testid="build-land-row-parcel-north-field"]',
    )!;
    expect(
      extension.compareDocumentPosition(north) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(extension.textContent).toMatch(/\$20\.00.*3 crop beds/i);
    expect(north.textContent).toMatch(/Buy Starter Extension first.*Locked/i);

    panel.root
      .querySelector<HTMLButtonElement>('[data-testid="build-land-parcel-starter-extension"]')!
      .click();
    expect(onBuyLand).toHaveBeenCalledWith('parcel-starter-extension');
  });

  it('marks requirements independently and enables advancement only when all are complete', () => {
    const panel = new CareerPanel({
      onClaimMilestone: vi.fn(),
      onChooseSpecialization: vi.fn(),
      onQueueProcessing: vi.fn(),
      onHireWorker: vi.fn(),
      onPrioritizeWorker: vi.fn(),
      onTakeLoan: vi.fn(),
      onRepayLoan: vi.fn(),
      onBuyInsurance: vi.fn(),
      onCancelInsurance: vi.fn(),
      onClose: vi.fn(),
    });
    const snapshot = {
      balance: cents(15_000),
      stageName: 'Smallholding',
      health: 'Healthy',
      milestone: {
        id: 'milestone-smallholder',
        title: 'Buy the North Field',
        nextStageName: 'Homestead',
        summary: 'The distant fields need better hauling.',
        progress: 0.75,
        ready: false,
        requirements: ['✓ Earned: $150.00/$150.00', '○ Parcels owned: 1/3'],
      },
      specializations: [],
      processors: [],
      workers: [],
      loans: [],
      insurance: [],
    } as const;

    panel.update(snapshot);
    expect(panel.root.textContent).toContain('✓ Earned: $150.00/$150.00');
    expect(panel.root.textContent).toContain('○ Parcels owned: 1/3');
    expect(
      panel.root.querySelector<HTMLButtonElement>(
        '[data-testid="career-claim-milestone-smallholder"]',
      )?.disabled,
    ).toBe(true);

    panel.update({
      ...snapshot,
      milestone: {
        ...snapshot.milestone,
        progress: 1,
        ready: true,
        requirements: ['✓ Earned: $150.00/$150.00', '✓ Parcels owned: 3/3'],
      },
    });
    expect(panel.root.textContent).toContain('✓ Parcels owned: 3/3');
    const advance = panel.root.querySelector<HTMLButtonElement>(
      '[data-testid="career-claim-milestone-smallholder"]',
    );
    expect(advance?.disabled).toBe(false);
    expect(advance?.textContent).toBe('Advance to Homestead');
  });

  it('routes milestone, processor, worker and town actions through their panels', () => {
    const claim = vi.fn();
    const queue = vi.fn();
    const employ = vi.fn();
    const prioritize = vi.fn();
    const career = new CareerPanel({
      onClaimMilestone: claim,
      onChooseSpecialization: vi.fn(),
      onQueueProcessing: queue,
      onHireWorker: employ,
      onPrioritizeWorker: prioritize,
      onTakeLoan: vi.fn(),
      onRepayLoan: vi.fn(),
      onBuyInsurance: vi.fn(),
      onCancelInsurance: vi.fn(),
      onClose: vi.fn(),
    });
    career.update({
      balance: cents(25_000),
      stageName: 'Licensed Producer',
      health: 'Healthy',
      milestone: {
        id: 'milestone-test',
        title: 'Test milestone',
        nextStageName: 'Local Supplier',
        summary: 'Ready.',
        progress: 1,
        ready: true,
        requirements: ['✓ Complete'],
      },
      specializations: [],
      processors: [
        {
          id: 'processor-row',
          buildingId: 'building-mill',
          recipeId: 'recipe-flour',
          title: 'Mill flour',
          meta: 'Ready',
          action: 'Queue 1',
          enabled: true,
        },
      ],
      workers: [
        {
          id: 'employed-worker-1',
          workerId: 'worker-1',
          title: 'Mara',
          meta: 'Field hand; priorities tending → harvesting',
          action: 'Prioritize harvesting',
          enabled: true,
        },
        {
          id: 'hauler',
          title: 'Hire hauler',
          meta: 'A free hut is ready.',
          action: 'Hire',
          enabled: true,
        },
      ],
      loans: [],
      insurance: [],
    });

    career.root
      .querySelector<HTMLButtonElement>('[data-testid="career-claim-milestone-test"]')!
      .click();
    career.root
      .querySelector<HTMLButtonElement>('[data-testid="career-action-processor-row"]')!
      .click();
    career.root.querySelector<HTMLButtonElement>('[data-testid="career-action-hauler"]')!.click();
    career.root
      .querySelector<HTMLButtonElement>('[data-testid="career-action-employed-worker-1"]')!
      .click();
    expect(claim).toHaveBeenCalledWith('milestone-test');
    expect(queue).toHaveBeenCalledWith('building-mill', 'recipe-flour');
    expect(employ).toHaveBeenCalledWith('hauler');
    expect(prioritize).toHaveBeenCalledWith('worker-1');
    expect(career.root.textContent).toContain('Next stage: Local Supplier');
    expect(career.root.textContent).toContain(
      'Complete every requirement to advance to Local Supplier:',
    );
    expect(career.root.textContent).toContain('Advance to Local Supplier');

    const fund = vi.fn();
    const town = new TownPanel({ onStartProject: fund, onClose: vi.fn() });
    town.update({
      stageName: 'Village',
      population: '200-600',
      prosperity: 180,
      summary: 'Growing.',
      activeProject: null,
      projectsUnlocked: true,
      projects: [
        {
          id: 'project-market-road',
          title: 'Market Road',
          description: 'A better road.',
          benefit: 'Deliveries pay more.',
          cost: cents(18_000),
          materials: '20 wheat',
          enabled: true,
        },
      ],
    });
    town.root
      .querySelector<HTMLButtonElement>('[data-testid="town-project-project-market-road"]')!
      .click();
    expect(fund).toHaveBeenCalledWith('project-market-road');
  });

  it('shows explicit countdowns on processor and town project wait bars', () => {
    const career = new CareerPanel({
      onClaimMilestone: vi.fn(),
      onChooseSpecialization: vi.fn(),
      onQueueProcessing: vi.fn(),
      onHireWorker: vi.fn(),
      onPrioritizeWorker: vi.fn(),
      onTakeLoan: vi.fn(),
      onRepayLoan: vi.fn(),
      onBuyInsurance: vi.fn(),
      onCancelInsurance: vi.fn(),
      onClose: vi.fn(),
    });
    career.update({
      context: 'processing',
      balance: cents(6_000),
      stageName: 'Homestead',
      health: 'Healthy',
      milestone: null,
      specializations: [],
      processors: [
        {
          id: 'preserves',
          buildingId: 'building-preserves',
          recipeId: 'recipe-preserves',
          title: 'Bottle preserves',
          meta: '3 Pumpkin → 3 Preserves',
          action: 'Unavailable',
          enabled: false,
          wait: {
            state: 'Processing',
            progress: 0.5,
            remainingTicks: 2_700,
          },
        },
      ],
      workers: [],
      loans: [],
      insurance: [],
    });
    const processorWait = career.root.querySelector<HTMLElement>(
      '[data-testid="career-wait-preserves"]',
    );
    expect(processorWait?.textContent).toContain('Processing · 45s remaining');
    expect(
      processorWait?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ).toBe('50');

    const town = new TownPanel({ onStartProject: vi.fn(), onClose: vi.fn() });
    town.update({
      stageName: 'Village',
      population: '200-600',
      prosperity: 180,
      summary: 'Growing.',
      activeProject: {
        title: 'Market Road',
        remainingTicks: 3_600,
        totalTicks: 7_200,
      },
      projectsUnlocked: true,
      projects: [],
    });
    const townWait = town.root.querySelector<HTMLElement>('[data-testid="town-project-wait"]');
    expect(townWait?.textContent).toContain('Building · 1m remaining');
    expect(townWait?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '50',
    );
  });

  it('does not reveal town projects before the career unlock', () => {
    const town = new TownPanel({ onStartProject: vi.fn(), onClose: vi.fn() });
    town.update({
      stageName: 'Hamlet',
      population: 'Under 200',
      prosperity: 0,
      summary: 'Small.',
      activeProject: null,
      projectsUnlocked: false,
      projects: [],
    });

    expect(town.root.textContent).toContain('council will invite established producers');
    expect(town.root.textContent).not.toContain('Market Road');
  });

  it('shows the council-funded starter project without malformed cost copy', () => {
    const fund = vi.fn();
    const town = new TownPanel({ onStartProject: fund, onClose: vi.fn() });
    town.update({
      stageName: 'Hamlet',
      population: 'Under 200',
      prosperity: 0,
      summary: 'Small.',
      activeProject: null,
      projectsUnlocked: true,
      projects: [
        {
          id: 'project-seed-box',
          title: 'Millbrook Seed Box',
          description: 'A council-funded box.',
          benefit: 'Town deliveries pay more.',
          cost: cents(0),
          materials: 'no materials needed',
          enabled: true,
        },
      ],
    });

    expect(town.root.textContent).toMatch(/\$0\.00 \+ no materials needed/i);
    town.root
      .querySelector<HTMLButtonElement>('[data-testid="town-project-project-seed-box"]')!
      .click();
    expect(fund).toHaveBeenCalledWith('project-seed-box');
  });

  it('distinguishes accepting an offer from delivering an accepted contract', () => {
    const act = vi.fn();
    const market = new MarketPanel({ onSellSpot: vi.fn(), onContract: act, onClose: vi.fn() });
    market.update({
      balance: cents(10_000),
      rows: [],
      contractsUnlocked: true,
      storageUsed: 4,
      storageCapacity: 60,
      contracts: [
        {
          action: 'accept',
          orderId: 'offer-1',
          itemId: 'wheat',
          displayName: 'Wheat — Millbrook Grocers',
          quantity: 10,
          payout: cents(500),
          spotValue: cents(400),
          premiumPercent: 0.25,
          ticksRemaining: 600,
          held: 0,
          canFulfil: true,
          minimumQuality: 0.7,
          recurringEveryTicks: 0,
          ticksUntilWindow: 0,
          canSchedule: true,
        },
        {
          action: 'deliver',
          orderId: 'contract-1',
          itemId: 'corn',
          displayName: 'Corn — deliver',
          quantity: 8,
          payout: cents(800),
          spotValue: cents(700),
          premiumPercent: 0,
          ticksRemaining: 600,
          held: 3,
          canFulfil: true,
          minimumQuality: 0,
          recurringEveryTicks: 14_400,
          ticksUntilWindow: 0,
          canSchedule: false,
        },
      ],
    });

    expect(market.root.textContent).toContain('Accept contract');
    expect(market.root.textContent).toContain('Quality 70%+');
    expect(market.root.textContent).toContain('Repeats every 4m');
    expect(market.root.textContent).toContain('Deliver 3');
    market.root.querySelector<HTMLButtonElement>('[data-testid="market-fulfil-wheat"]')!.click();
    market.root.querySelector<HTMLButtonElement>('[data-testid="market-fulfil-corn"]')!.click();
    market.root
      .querySelector<HTMLButtonElement>('[data-testid="market-schedule-offer-1"]')!
      .click();
    market.root
      .querySelector<HTMLButtonElement>('[data-testid="market-cancel-contract-1"]')!
      .click();
    expect(act).toHaveBeenNthCalledWith(1, 'offer-1', 'accept');
    expect(act).toHaveBeenNthCalledWith(2, 'contract-1', 'deliver');
    expect(act).toHaveBeenNthCalledWith(3, 'offer-1', 'schedule');
    expect(act).toHaveBeenNthCalledWith(4, 'contract-1', 'cancel');
  });

  it('hides the contract surface before the progression unlock', () => {
    const market = new MarketPanel({
      onSellSpot: vi.fn(),
      onContract: vi.fn(),
      onClose: vi.fn(),
    });
    market.update({
      balance: cents(5_000),
      rows: [],
      contractsUnlocked: false,
      contracts: [],
      storageUsed: 0,
      storageCapacity: 60,
    });

    expect(
      market.root.querySelector<HTMLElement>('[data-testid="market-contracts-heading"]')!.hidden,
    ).toBe(true);
    expect(market.root.querySelector<HTMLElement>('[data-testid="market-contracts"]')!.hidden).toBe(
      true,
    );
  });
});
