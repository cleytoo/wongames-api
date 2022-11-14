/**
 * game controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::game.game', () => ({
   populate: async (ctx) => {
    console.log('Starting to populate...')

    const options = {
      sort: 'popularity',
      page: '1',
      ...ctx.query
    }


    await strapi.service('api::game.game').populate(options);

    ctx.send('Finished populating!')
   }
}));
