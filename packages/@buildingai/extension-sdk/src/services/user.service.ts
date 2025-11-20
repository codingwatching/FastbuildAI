import { BaseService } from "@buildingai/base";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { User } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { UUIDValidationPipe } from "@buildingai/pipe/param-validate.pipe";
import { Injectable, Param } from "@nestjs/common";

/**
 * Public user services
 */
@Injectable()
export class PublicUserService {
    private readonly baseService: BaseService<User>;
    /**
     * Constructor
     *
     * @param userRepository User repository
     */
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {
        this.baseService = new BaseService<User>(this.userRepository);
    }

    /**
     * Find user by id
     *
     * @param id User id
     * @returns User info
     */
    async findUserById(@Param("id", UUIDValidationPipe) id: string) {
        const result = await this.baseService.findOneById(id, {
            excludeFields: ["password", "openid"],
            relations: ["role"],
        });

        if (!result) {
            throw HttpErrorFactory.notFound("User not found");
        }
        return result;
    }
}
