import { describe, expect, it } from 'vitest';
import { INCIDENTS, careerSaveStateSchema } from '@farmrise/shared';
import { createIncidentReviewCareer } from '@game/debug/incidentReview.js';

describe('incident review careers', () => {
  it('hydrates every catalogue incident from a valid focused save', () => {
    for (const definition of INCIDENTS) {
      const review = createIncidentReviewCareer(definition.id);
      expect(careerSaveStateSchema.safeParse(review.state).success).toBe(true);
      expect(review.state.incidents).toHaveLength(1);
      expect(review.state.incidents[0]?.definitionId).toBe(definition.id);
      expect(review.state.incidents[0]?.targetIds.length).toBeGreaterThan(0);
      expect(review.state.incidents[0]?.impactTick).toBeGreaterThan(review.state.tick);
    }
  });
});
