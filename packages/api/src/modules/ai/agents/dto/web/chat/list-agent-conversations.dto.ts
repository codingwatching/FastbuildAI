import { PaginationDto } from "@buildingai/dto/pagination.dto";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ListAgentConversationsDto extends PaginationDto {
    @IsOptional()
    @IsString()
    keyword?: string;

    @IsOptional()
    @IsString()
    @IsIn(["createdAt", "updatedAt"], { message: "sortBy 须为 createdAt 或 updatedAt" })
    sortBy?: "createdAt" | "updatedAt";
}
