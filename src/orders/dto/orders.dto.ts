import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemAddonDto {
  @IsUUID()
  @IsNotEmpty()
  addonId: string;
}

export class CreateOrderItemDto {
  @IsUUID()
  @IsOptional()
  menuItemId?: string;

  @IsString()
  @IsOptional()
  customItemName?: string;

  @IsOptional()
  @Min(0)
  priceAtOrder?: number;

  @IsUUID()
  @IsOptional()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemAddonDto)
  addons?: CreateOrderItemAddonDto[];
}

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsUUID()
  @IsOptional()
  restaurantId?: string;

  @IsString()
  @IsOptional()
  customRestaurantName?: string;
}

export class AddItemsToOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
