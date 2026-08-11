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
      landCost: cents(0),
      canAffordLand: false,
      landAvailable: false,
      landProgress: 1,
      landName: null,
      carriers: [{ kind: 'wagon', affordable: true }],
    });

    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-animal-cow"]')!.click();
    panel.root.querySelector<HTMLButtonElement>('[data-testid="build-carrier-wagon"]')!.click();
    expect(onBuyAnimal).toHaveBeenCalledWith('cow');
    expect(onBuyCarrier).toHaveBeenCalledWith('wagon');
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
