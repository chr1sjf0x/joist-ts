import { EntityManager } from "../EntityManager";
import { knex, numberOfQueries, resetQueryCount } from "../setupDbTests";
import { Book } from "../../integration/Book";
import { zeroTo } from "../utils";
import { Tag } from "../../integration/Tag";

describe("ManyToManyCollection", () => {
  it("can load a many-to-many", async () => {
    await knex.insert({ id: 1, first_name: "a1" }).into("authors");
    await knex.insert({ id: 2, title: "b1", author_id: 1 }).into("books");
    await knex.insert({ id: 3, name: "t1" }).into("tags");
    await knex.insert({ id: 4, book_id: 2, tag_id: 3 }).into("books_to_tags");

    const em = new EntityManager(knex);
    const book = await em.load(Book, "2");
    const tags = await book.tags.load();
    expect(tags.length).toEqual(1);
    expect(tags[0].name).toEqual("t1");
  });

  it("can load a many-to-many with constant queries", async () => {
    // Given a book has 5 tags
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    await Promise.all(
      zeroTo(5).map(async i => {
        await knex.insert({ name: `t${i}` }).into("tags");
        await knex.insert({ book_id: 1, tag_id: i + 1 }).into("books_to_tags");
      }),
    );

    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    resetQueryCount();
    const tags = await book.tags.load();
    expect(tags.length).toEqual(5);
    // 1 query to the join table, and 1 query to the tags table
    expect(numberOfQueries).toEqual(2);
  });

  it("can load both sides of a many-to-many with constant queries", async () => {
    // Given a book has 5 tags
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    await Promise.all(
      zeroTo(5).map(async i => {
        await knex.insert({ name: `t${i}` }).into("tags");
        await knex.insert({ book_id: 1, tag_id: i + 1 }).into("books_to_tags");
      }),
    );
    // And the 1st tag itself has two more books
    await Promise.all(
      zeroTo(2).map(async i => {
        await knex.insert({ title: `b${i + 1}`, author_id: 1 }).into("books");
        await knex.insert({ book_id: i + 2, tag_id: 1 }).into("books_to_tags");
      }),
    );

    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const tag = await em.load(Tag, "1");
    resetQueryCount();
    const [b1Tags, t1Books] = await Promise.all([book.tags.load(), tag.books.load()]);
    expect(b1Tags.length).toEqual(5);
    expect(t1Books.length).toEqual(3);
    // 1 query to the join table, 1 query to the tags table (for t2-5), and 1 query to the books table (for b2-3)
    expect(numberOfQueries).toEqual(3);
  });
});