using System;
using System.Collections.Generic;

namespace DinnerSuggestionApi.Helpers;

public static class IngredientTypeHelper
{
    public static readonly string[] AllowedTypes =
    [
        "야채",
        "탄수화물",
        "고기/단백질",
        "유제품",
        "과일",
        "소스/조미료",
        "냉동식품",
        "기타"
    ];

    private static readonly Dictionary<string, string> KnownTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["양파"] = "야채",
        ["대파"] = "야채",
        ["쪽파"] = "야채",
        ["마늘"] = "야채",
        ["감자"] = "야채",
        ["고구마"] = "야채",
        ["당근"] = "야채",
        ["오이"] = "야채",
        ["호박"] = "야채",
        ["애호박"] = "야채",
        ["배추"] = "야채",
        ["양배추"] = "야채",
        ["상추"] = "야채",
        ["깻잎"] = "야채",
        ["시금치"] = "야채",
        ["브로콜리"] = "야채",
        ["버섯"] = "야채",
        ["토마토"] = "야채",
        ["콩나물"] = "야채",
        ["숙주"] = "야채",
        ["무"] = "야채",
        ["김치"] = "야채",

        ["쌀"] = "탄수화물",
        ["밥"] = "탄수화물",
        ["라면"] = "탄수화물",
        ["국수"] = "탄수화물",
        ["우동"] = "탄수화물",
        ["파스타"] = "탄수화물",
        ["면"] = "탄수화물",
        ["빵"] = "탄수화물",
        ["토르티야"] = "탄수화물",
        ["떡"] = "탄수화물",
        ["밀가루"] = "탄수화물",

        ["계란"] = "고기/단백질",
        ["달걀"] = "고기/단백질",
        ["닭고기"] = "고기/단백질",
        ["소고기"] = "고기/단백질",
        ["돼지고기"] = "고기/단백질",
        ["햄"] = "고기/단백질",
        ["베이컨"] = "고기/단백질",
        ["참치"] = "고기/단백질",
        ["두부"] = "고기/단백질",
        ["스팸"] = "고기/단백질",
        ["소시지"] = "고기/단백질",
        ["새우"] = "고기/단백질",
        ["생선"] = "고기/단백질",

        ["우유"] = "유제품",
        ["치즈"] = "유제품",
        ["버터"] = "유제품",
        ["요거트"] = "유제품",
        ["생크림"] = "유제품",

        ["사과"] = "과일",
        ["바나나"] = "과일",
        ["배"] = "과일",
        ["오렌지"] = "과일",
        ["포도"] = "과일",
        ["딸기"] = "과일",
        ["블루베리"] = "과일",
        ["레몬"] = "과일",

        ["간장"] = "소스/조미료",
        ["고추장"] = "소스/조미료",
        ["된장"] = "소스/조미료",
        ["쌈장"] = "소스/조미료",
        ["식초"] = "소스/조미료",
        ["참기름"] = "소스/조미료",
        ["들기름"] = "소스/조미료",
        ["소금"] = "소스/조미료",
        ["설탕"] = "소스/조미료",
        ["후추"] = "소스/조미료",
        ["고춧가루"] = "소스/조미료",
        ["케첩"] = "소스/조미료",
        ["마요네즈"] = "소스/조미료",

        ["냉동만두"] = "냉동식품",
        ["만두"] = "냉동식품",
        ["냉동새우"] = "냉동식품",
        ["냉동볶음밥"] = "냉동식품",
        ["아이스크림"] = "냉동식품"
    };

    public static string NormalizeType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "기타";

        foreach (var allowed in AllowedTypes)
        {
            if (string.Equals(allowed, value.Trim(), StringComparison.OrdinalIgnoreCase))
                return allowed;
        }

        return "기타";
    }

    public static bool TryGetKnownType(string? ingredientName, out string type)
    {
        type = "기타";

        if (string.IsNullOrWhiteSpace(ingredientName))
            return false;

        return KnownTypes.TryGetValue(ingredientName.Trim(), out type!);
    }
}