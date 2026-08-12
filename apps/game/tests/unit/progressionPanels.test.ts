import { describe, expect, it, vi } from 'vitest';
import { cents } from '@farmrise/shared';
import { BuildPanel } from '@ui/panels/BuildPanel.js';
import { CareerPanel } from '@ui/panels/CareerPanel.js';
import { MarketPanel } from '@ui/panels/MarketPanel.js';
import { TownPanel } from '@ui/panels/TownPanel.js';

describe('progression management panels', () => {
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
        { species: 'cow', affordable: true, shelterRequired: 4 },
      ],
      shelterFree: 8,
      land: [],
      carriers: [{ kind: 'wagon', affordable: true }],
    });

    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-animal-cow"]')!.click();
    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-carrier-wagon"]')!.click();
    expect(onBuyAnimal).toHaveBeenCalledWith('cow');
    expect(onBuyCarrier).toHaveBeenCalledWith('wagon');
    expect(panel.root.textContent).toMatch(/stored Corn.*Eggs.*sell them at Market/i);
    expect(panel.root.textContent).toMatch(/stored Clover.*Milk.*sell them at Market/i);
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

  it('routes milestone, processor, worker and town actions through their panels', () => {
    const claim = vi.fn();
    const queue = vi.fn();
    const employ = vi.fn();
    const career = new CareerPanel({
      onClaimMilestone: claim,
      onChooseSpecialization: vi.fn(),
      onQueueProcessing: queue,
      onHireWorker: employ,
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
        roleName: 'Supplier',
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
    expect(claim).toHaveBeenCalledWith('milestone-test');
    expect(queue).toHaveBeenCalledWith('building-mill', 'recipe-flour');
    expect(employ).toHaveBeenCalledWith('hauler');

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
    const market = new MarketPanel({ onSellSpot: vi.fn(), onFulfil: act, onClose: vi.fn() });
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
        },
      ],
    });

    expect(market.root.textContent).toContain('Accept contract');
    expect(market.root.textContent).toContain('Deliver 3');
    market.root.querySelector<HTMLButtonElement>('[data-testid="market-fulfil-wheat"]')!.click();
    market.root.querySelector<HTMLButtonElement>('[data-testid="market-fulfil-corn"]')!.click();
    expect(act).toHaveBeenNthCalledWith(1, 'offer-1', 'accept');
    expect(act).toHaveBeenNthCalledWith(2, 'contract-1', 'deliver');
  });

  it('hides the contract surface before the progression unlock', () => {
    const market = new MarketPanel({
      onSellSpot: vi.fn(),
      onFulfil: vi.fn(),
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
