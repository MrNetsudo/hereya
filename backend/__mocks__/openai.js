'use strict';

const OpenAI = jest.fn().mockImplementation(() => ({
  moderations: {
    create: jest.fn().mockResolvedValue({
      results: [{
        flagged: false,
        categories: {},
        category_scores: { hate: 0.001, harassment: 0.001, sexual: 0.001, violence: 0.001 },
      }],
    }),
  },
}));

module.exports = OpenAI;
