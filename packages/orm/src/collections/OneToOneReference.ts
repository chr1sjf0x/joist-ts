import { deTagIds, ensureNotDeleted, fail, getEm, IdOf, Reference, unsafeDeTagIds } from "../";
import { Entity, EntityMetadata, getMetadata } from "../EntityManager";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToOneReference } from "./ManyToOneReference";

/**
 * Represents the "many" side of a one-to-one relationship.
 *
 * I.e. in a one-to-many from Book -> Reviews, there is a review.book_id that can have many books.
 *
 * This class is for when that `review.book_id` column is itself unique, i.e. like `image.book_id`, and
 * so instead of `Book.images: OneToManyCollection` we have a `Book.image: OneToOneReference`.
 *
 * This class implements `Reference` because it is essentially like "one entity pointing/refereing to another",
 * however because we require a `.load` call to lazily know the value of other side (unlike ManyToOneReference
 * which has it's `book_id` column immediately available in the entity `data` hash), there is some wonkiness
 * around methods like `Reference.id` that are usually callable without `load`/`populate`, that for this
 * class can actually only be called post `load`/`populate`.
 *
 * Currently we enforce this with a runtime check, which is not great, but the trade-off of implementing
 * `Reference` seemed worth the downside of a un-type-safe `.id` property.
 */
export class OneToOneReference<T extends Entity, U extends Entity> extends AbstractRelationImpl<U>
  implements Reference<T, U, undefined> {
  private loaded: U | undefined;
  private isLoaded: boolean = false;
  private isCascadeDelete: boolean;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata<U>,
    public fieldName: keyof T,
    public otherFieldName: keyof U,
  ) {
    super();
    this.isCascadeDelete = getMetadata(entity).config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  get id(): IdOf<U> | undefined {
    if (this.isLoaded) {
      return this.loaded?.id as IdOf<U> | undefined;
    }
    throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
  }

  get idOrFail(): IdOf<U> {
    return this.id || fail(`${this.entity}.${this.fieldName} has no id yet`);
  }

  get idUntagged(): string | undefined {
    return this.id && deTagIds(this.otherMeta, [this.id])[0];
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Reference is unset or assigned to a new entity");
  }

  get isSet(): boolean {
    // This will failure if we're not loaded yet
    return this.id !== undefined;
  }

  // opts is an internal parameter
  async load(opts?: { withDeleted?: boolean }): Promise<U | undefined> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this.isLoaded) {
      if (this.entity.id !== undefined) {
        this.loaded = (
          await getEm(this.entity).find(this.otherMeta.cstr, {
            [this.otherFieldName]: this.entity,
          } as any)
        )[0];
      }
      // this.maybeAppendAddedBeforeLoaded();
      this.isLoaded = true;
    }
    return this.filterDeleted(this.loaded, opts);
  }

  set(other: U): void {
    ensureNotDeleted(this.entity);
    if (other === this.loaded) {
      return;
    }
    if (this.isLoaded) {
      if (this.loaded) {
        this.getOtherRelation(this.loaded).set(undefined);
      }
    }
    this.loaded = other;
    this.isLoaded = true;
    // This will no-op and mark other dirty if necessary
    if (other) {
      this.getOtherRelation(other).set(this.entity);
    }
  }

  get getWithDeleted(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  private doGet(): U | undefined {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this.isLoaded) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error("get was called when not preloaded");
    }
    return this.loaded;
  }

  // internal impl

  setFromOpts(other: U): void {
    this.set(other);
  }

  initializeForNewEntity(): void {
    this.isLoaded = true;
  }

  async refreshIfLoaded(): Promise<void> {
    if (this.isLoaded) {
      this.isLoaded = false;
      await this.load();
    }
  }

  onEntityDelete(): void {
    // if (this.isCascadeDelete) {
    //   this.current({ withDeleted: true }).forEach(getEm(this.entity).delete);
    // }
  }

  async onEntityDeletedAndFlushing(): Promise<void> {}

  public toString(): string {
    return `OneToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  private filterDeleted(entity: U | undefined, opts?: { withDeleted?: boolean }): U | undefined {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : undefined;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReference<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }
}
