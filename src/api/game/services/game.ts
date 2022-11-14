/**
 * game service
 */

import { factories  } from '@strapi/strapi';
import { GenericService } from '@strapi/strapi/lib/core-api/service';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import slugify from 'slugify' ;
import qs from 'querystring'


type Falha = {
  game: any
  image: string
  field: string
}

let falhas: Falha[] = []

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors };
}

const getGameInfo = async  (slug: string) => {
  const body = await axios.get(`https://www.gog.com/game/${slug}`)
  const dom = new JSDOM(body.data)

  const description = dom.window.document.querySelector('.description')

  return {
    rating: 'BR0',
    short_description: description.textContent.trim().slice(0,160),
    description: description.innerHTML
  }
}

const getByName = async (name:string, entityName: string) => {
  const { results } = await strapi.service(`api::${entityName}.${entityName}`).find({
    filters: {name}
  }) as any

 return results.length ? results[0] : null
}

const create = async (name:string, entityName: string) =>  {
  const item = await getByName(name, entityName)
  if(!item) {
    return await strapi.service(`api::${entityName}.${entityName}`).create({
      data: {
        name,
        slug: slugify(name, {lower: true})
      }
    })
  }
}

 const createManyToManyData = async (products: any) => {
  const developers = new Set();
  const publishers = new Set();
  const categories = new Set();
  const platforms = new Set();

  products.forEach((product) => {
    const { developer, publisher, genres, supportedOperatingSystems } = product;

    genres?.forEach((item) => {
      categories.add(item);
    });

    supportedOperatingSystems?.forEach((item) => {
      platforms.add(item);
    });

    developers.add(developer);
    publishers.add(publisher);
  });

  const createCall = (set, entityName) => Array.from(set).map((name) => create(String(name), entityName));

  return Promise.all([
    ...createCall(developers, "developer"),
    ...createCall(publishers, "publisher"),
    ...createCall(categories, "category"),
    ...createCall(platforms, "platform"),
  ]);
 }

 async function setImage({ image, game, field = "cover" }) {
  try {
    const url = `https:${image}.jpg`;
    const { data } = await axios.get(url, { responseType: "arraybuffer" });
    await timeout(3000)
    const buffer = Buffer.from(data, "base64");
    await timeout(5000)

    const FormData = require("form-data");
    const formData = new FormData();

    formData.append("refId", game.id);
    formData.append("ref", "api::game.game");
    formData.append("field", field);
    formData.append("files", buffer, { filename: `${game.slug}.jpg` });



    console.info(`Uploading ${field} image: ${game.slug}.jpg`);

     await axios({
      method: "POST",
      url: `http://${strapi.config.host}:${strapi.config.port}/api/upload`,
      data: formData,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    });

  } catch (e) {
    console.log("setImage", Exception(e));
    falhas.push({game, image, field })
  }
}

 const createGames = async (products: any) => {
  await Promise.all(
    products.map(async (product) => {
      const item = await getByName(product.title, "game");

      if (!item) {
        console.info(`Creating: ${product.title}...`);

        const game = await strapi.service('api::game.game').create({
         data: {
          name: product.title,
          slug: product.slug.replace(/_/g, "-"),
          price: product.price.amount,
          release_date: new Date(
            Number(product.globalReleaseDate) * 1000
          ).toISOString(),
          categories: await Promise.all(
            product.genres.map((name) => getByName(name, "category"))
          ),
          platforms: await Promise.all(
            product.supportedOperatingSystems.map((name) =>
              getByName(name, "platform")
            )
          ),
          developers: [await getByName(product.developer, "developer")],
          publisher: await getByName(product.publisher, "publisher"),
          ...(await getGameInfo(product.slug)),
         }
        });

        await setImage({ image: product.image, game });
        await Promise.all(
          product.gallery
            .slice(0, 5)
            .map((url) => setImage({ image: url, game, field: "gallery" }))
        );

        await timeout(6000);

        return game;
      }
    })
  );
 }

 const test = async () => {
  try {
    const url =  'https://images-4.gog-statics.com/6476b928851b469ce7ae03ed016b258aea621dd6f4bb223a7fa9675f0170454d.jpg'
    const { data } = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(data, "base64");

    const FormData = require("form-data");
    const formData = new FormData();

    formData.append("refId", 44);
    formData.append("ref", "api::game.game");
    formData.append("field", 'cover');
    formData.append("files", buffer, { filename: `${44}.jpg` });


    await axios({
      method: "POST",
      url: `http://${strapi.config.host}:${strapi.config.port}/api/upload`,
      data: formData,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    });


  } catch (error) {
    // console.log(error)
  }
 }


export default factories.createCoreService('api::game.game', ({strapi}) => ({
  populate: async (params) => {

    const gogApiUrl = `https://www.gog.com/games/ajax/filtered?mediaType=game&${qs.stringify(params)}`


    const { data: { products } } = await axios.get(gogApiUrl)


    // await createManyToManyData(products.slice(0 ,30))
    await createGames(products.slice(0, 50))



    if(falhas.length > 0 ) {
      console.log('Corrigindo falhas...')
       await Promise.all(
        falhas.map((falha) => {
          console.log(`name: ${falha.game.name}, id: ${falha.game.id}, type: ${falha.field}`)
          setImage({image:falha.image, game:falha.game, field: falha.field })
        })
       )
    }





  },
} as GenericService));
